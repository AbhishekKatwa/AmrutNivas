#!/usr/bin/env node
/**
 * Provision demo users with passwords for User ID + Password authentication.
 *
 * This script creates auth.users entries via Supabase Admin API, then creates
 * corresponding profiles with user_id fields. Run this after applying migration
 * 049_password_authentication.sql.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node db/provision-demo-users.mjs
 *
 * The service role key is required because only the admin API can create auth
 * users with passwords. Never commit the service key to source control.
 *
 * Demo credentials (development only):
 *   OWNER001 / Owner123!
 *   MANAGER001 / Manager123!
 *   STAFF001 / Staff123!
 *   HOUSEKEEPING001 / House123!
 *   FINANCE001 / Finance123!
 */

import { createClient } from "@supabase/supabase-js";

const DEMO_USERS = [
  { userId: "OWNER001", email: "owner001@amrut-nivas.local", password: "Owner123!", fullName: "Demo Owner", role: "ORG_OWNER" },
  { userId: "MANAGER001", email: "manager001@amrut-nivas.local", password: "Manager123!", fullName: "Demo Manager", role: "FARM_MANAGER" },
  { userId: "STAFF001", email: "staff001@amrut-nivas.local", password: "Staff123!", fullName: "Demo Staff", role: "RESTAURANT_STAFF" },
  { userId: "HOUSEKEEPING001", email: "housekeeping001@amrut-nivas.local", password: "House123!", fullName: "Demo Housekeeping", role: "HOUSEKEEPING_STAFF" },
  { userId: "FINANCE001", email: "finance001@amrut-nivas.local", password: "Finance123!", fullName: "Demo Finance", role: "FINANCE_CONTROLLER" },
];

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.");
    console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node db/provision-demo-users.mjs");
    process.exit(1);
  }

  const adminClient = createClient(supabaseUrl, serviceKey);

  console.log("Provisioning demo users with passwords...\n");

  for (const user of DEMO_USERS) {
    console.log(`Creating user: ${user.userId} (${user.fullName})`);

    // Create auth user with password
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        user_id: user.userId,
        full_name: user.fullName,
      },
    });

    if (authError) {
      if (authError.message.includes("already been registered")) {
        console.log(`  ⚠ User ${user.userId} already exists, skipping.`);
        continue;
      }
      console.error(`  ✗ Failed to create auth user: ${authError.message}`);
      continue;
    }

    console.log(`  ✓ Auth user created: ${authUser.user.id}`);

    // Update profile with user_id (the trigger should have created the profile)
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ user_id: user.userId })
      .eq("id", authUser.user.id);

    if (profileError) {
      console.error(`  ✗ Failed to update profile: ${profileError.message}`);
      continue;
    }

    console.log(`  ✓ Profile updated with user_id: ${user.userId}`);
  }

  console.log("\n✓ Demo user provisioning complete.");
  console.log("\nDemo credentials (development only):");
  for (const user of DEMO_USERS) {
    console.log(`  ${user.userId} / ${user.password}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
