declare const require: (path: string) => unknown;

const variant = (
  process.env.EXPO_PUBLIC_APP_ROLE ??
  process.env.APP_VARIANT ??
  'worker'
).trim().toLowerCase();

if (variant === 'admin') {
  require('./apps/admin/index');
} else {
  require('./apps/worker/index');
}
