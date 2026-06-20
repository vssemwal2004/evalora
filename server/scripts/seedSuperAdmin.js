const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const { ADMIN_PERMISSIONS, ROLES } = require('../src/constants/roles');

async function seedSuperAdmin() {
  await connectDB();

  const name = process.env.SEED_SUPER_ADMIN_NAME || 'Evalora Super Admin';
  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD are required.');
  }

  const existing = await User.findOne({ email: email.toLowerCase(), role: ROLES.SUPER_ADMIN });

  if (existing) {
    console.log(`Super admin already exists: ${existing.email}`);
    process.exit(0);
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    loginId: email.toLowerCase(),
    uniqueUsername: email.toLowerCase(),
    passwordHash: await User.hashPassword(password),
    role: ROLES.SUPER_ADMIN,
    permissions: ADMIN_PERMISSIONS,
  });

  console.log(`Super admin created: ${user.email}`);
  process.exit(0);
}

seedSuperAdmin().catch((error) => {
  console.error(error);
  process.exit(1);
});
