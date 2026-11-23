import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { USER_ROLES } from '../shared/constants';
import { User } from '../shared/types';
import { validateEnvironment } from '../server/src/config/env';
import { initializeFirebaseAdmin } from '../server/src/config/firebase';
import { DemoRepository } from '../server/src/repositories/DemoRepository';

const userEntrySchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(120),
  provider: z.enum(['email_password', 'google']).default('email_password'),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(USER_ROLES),
  department: z.string().trim().min(2).max(80),
  completedTrainings: z.array(z.string().trim().min(1).max(80)).default([]),
  safetyCleared: z.boolean().default(false),
});

const fileSchema = z.object({
  users: z.array(userEntrySchema).min(1).max(100),
});

function parseArgs() {
  const args = process.argv.slice(2);
  let filePath = process.env.USERS_CONFIG_FILE || 'users.local.json';
  let seedEquipment = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--file' && args[i + 1]) {
      filePath = args[i + 1];
      i += 1;
    } else if (args[i] === '--seed-equipment') {
      seedEquipment = true;
    }
  }
  return { filePath, seedEquipment };
}

async function main() {
  const { filePath, seedEquipment } = parseArgs();
  const resolved = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Provisioning file "${filePath}" not found. Copy users.example.json to users.local.json with real non-placeholder passwords first.`,
    );
  }

  const rawJson = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const parsed = fileSchema.parse(rawJson);

  for (const entry of parsed.users) {
    if (entry.provider === 'email_password') {
      if (!entry.password || entry.password.includes('CHANGE_ME')) {
        throw new Error(
          `Placeholder or missing password detected for email_password user "${entry.email}". Replace CHANGE_ME_BEFORE_PROVISIONING in ${filePath}.`,
        );
      }
    }
  }

  const config = validateEnvironment({
    ...process.env,
    STORAGE_MODE: 'firestore',
    AUTH_MODE: 'firebase',
  });
  const { auth, db } = initializeFirebaseAdmin(config);

  for (const entry of parsed.users) {
    let uid: string;
    try {
      const existingAuth = await auth.getUserByEmail(entry.email);
      uid = existingAuth.uid;
      if (entry.provider === 'email_password' && entry.password) {
        await auth.updateUser(uid, {
          displayName: entry.displayName,
          emailVerified: true,
          password: entry.password,
        });
      } else {
        await auth.updateUser(uid, {
          displayName: entry.displayName,
          emailVerified: true,
        });
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/user-not-found') {
        throw err;
      }
      const created = await auth.createUser({
        email: entry.email,
        displayName: entry.displayName,
        emailVerified: true,
        ...(entry.provider === 'email_password' && entry.password
          ? { password: entry.password }
          : {}),
      });
      uid = created.uid;
    }

    const userRef = db.collection('users').doc(uid);
    const existingSnap = await userRef.get();
    const nowIso = new Date().toISOString();
    const prevCreatedAt =
      existingSnap.exists && typeof existingSnap.data()?.createdAt === 'string'
        ? (existingSnap.data()!.createdAt as string)
        : nowIso;

    const userDoc: User = {
      id: uid,
      email: entry.email,
      displayName: entry.displayName,
      role: entry.role,
      department: entry.department,
      completedTrainings: entry.completedTrainings,
      safetyCleared: entry.safetyCleared,
      createdAt: prevCreatedAt,
      updatedAt: nowIso,
    };

    await userRef.set(userDoc, { merge: true });
    // Never log passwords
    console.log(
      JSON.stringify({
        status: 'provisioned',
        uid,
        email: entry.email,
        role: entry.role,
        provider: entry.provider,
      }),
    );
  }

  if (seedEquipment) {
    const demoRepo = new DemoRepository();
    const seededEquipment = await demoRepo.listEquipment({ includeArchived: true });
    for (const eq of seededEquipment) {
      const ref = db.collection('equipment').doc(eq.id);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set(eq);
      }
    }
    console.log(
      JSON.stringify({
        status: 'equipment_seeded',
        count: seededEquipment.length,
      }),
    );
  }
}

main().catch((err) => {
  console.error('Provisioning failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
