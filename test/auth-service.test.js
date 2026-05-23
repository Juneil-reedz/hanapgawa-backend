const test = require('node:test');
const assert = require('node:assert/strict');

const googleAuthPath = require.resolve('google-auth-library');
const repoPath = require.resolve('../src/repositories/user-repository');
const authServicePath = require.resolve('../src/services/auth-service');
const envPath = require.resolve('../src/config/env');

function loadAuthService({ payload, user }) {
  delete require.cache[authServicePath];
  delete require.cache[googleAuthPath];
  delete require.cache[repoPath];

  require.cache[googleAuthPath] = {
    id: googleAuthPath,
    filename: googleAuthPath,
    loaded: true,
    exports: {
      OAuth2Client: class {
        async verifyIdToken() {
          return { getPayload: () => payload };
        }
      },
    },
  };

  require.cache[repoPath] = {
    id: repoPath,
    filename: repoPath,
    loaded: true,
    exports: {
      createEmailVerificationCode: async () => ({}),
      createUser: async () => {
        throw new Error('createUser should not be called during Google Sign-In');
      },
      findActiveEmailVerificationCode: async () => null,
      findUserByEmail: async () => user,
      markEmailVerified: async () => user,
      markUserEmailVerified: async () => user,
    },
  };

  const { env } = require(envPath);
  env.googleClientId = 'test-google-client-id';
  env.jwtSecret = 'test-secret';

  return require(authServicePath);
}

test('Google Sign-In rejects verified Google accounts without an existing registered user', async () => {
  const { signInWithGoogle } = loadAuthService({
    payload: {
      email: 'new-user@example.com',
      email_verified: true,
      name: 'New User',
    },
    user: null,
  });

  await assert.rejects(
    () => signInWithGoogle({ idToken: 'valid-id-token' }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.message, 'Create an account before using Google Sign-In.');
      return true;
    },
  );
});
