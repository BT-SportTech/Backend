import { formatDisplayName } from '../common/display-name';

export const WELCOME_PUSH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isWithinWelcomeWindow(
  createdAt: Date,
  now = Date.now(),
): boolean {
  return now - createdAt.getTime() <= WELCOME_PUSH_WINDOW_MS;
}

export function buildWelcomePushPayload(user: {
  id: string;
  firstName: string;
  lastName: string;
}) {
  const name = formatDisplayName(user.firstName, user.lastName);
  return {
    type: 'welcome',
    notificationId: `n_welcome_${user.id}`,
    title: 'Welcome to SportTech',
    body: name
      ? `Hi ${name}, your profile is ready. Explore events and start competing!`
      : 'Your profile is ready. Explore events and start competing!',
  };
}
