import {
  buildWelcomePushPayload,
  isWithinWelcomeWindow,
  WELCOME_PUSH_WINDOW_MS,
} from './welcome-push.util';

describe('welcome push', () => {
  it('greets the player by name', () => {
    expect(
      buildWelcomePushPayload({
        id: 'user1',
        firstName: 'Asha',
        lastName: '',
      }),
    ).toEqual({
      type: 'welcome',
      notificationId: 'n_welcome_user1',
      title: 'Welcome to SportTech',
      body: 'Hi Asha, your profile is ready. Explore events and start competing!',
    });
  });

  it('only sends within the welcome window', () => {
    const now = Date.UTC(2026, 7, 21);
    expect(isWithinWelcomeWindow(new Date(now), now)).toBe(true);
    expect(
      isWithinWelcomeWindow(new Date(now - WELCOME_PUSH_WINDOW_MS), now),
    ).toBe(true);
    expect(
      isWithinWelcomeWindow(new Date(now - WELCOME_PUSH_WINDOW_MS - 1), now),
    ).toBe(false);
  });
});
