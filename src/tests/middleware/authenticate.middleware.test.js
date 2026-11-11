
/*
======================================================
KOBOMARKET ACCESS-TOKEN AUTHENTICATION TESTS
======================================================
*/

// Mock the MongoDB User model before loading middleware.
jest.mock('../../modules/users/models/user.model', () => ({
  findById: jest.fn()
}));

// Load the mocked User model.
const User = require('../../modules/users/models/user.model');

// Load jsonwebtoken to generate test access tokens.
const jwt = require('jsonwebtoken');

// Load the authentication middleware.
const {
  authenticate,
  getAccessTokenConfiguration
} = require('../../middleware/authenticate.middleware');

// Preserve the original environment.
const originalEnvironment = { ...process.env };

// Test JWT secrets.
const ACCESS_SECRET =
  'test-access-secret-with-more-than-32-characters';

const REFRESH_SECRET =
  'test-refresh-secret-with-more-than-32-characters';

// Test customer identifier.
const USER_ID = '507f1f77bcf86cd799439011';

// --------------------------------------------------
// TEST SETUP
// --------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;
  process.env.JWT_REFRESH_SECRET = REFRESH_SECRET;

  User.findById.mockResolvedValue({
    _id: USER_ID,
    role: 'customer',
    isActive: true,
    isEmailVerified: true
  });
});

// Restore the original environment after all tests.
afterAll(() => {
  process.env = originalEnvironment;
});

// --------------------------------------------------
// HELPER 1: GENERATE TEST ACCESS TOKENS
// --------------------------------------------------

function createAccessToken(payload = {}) {
  return jwt.sign(
    {
      sub: USER_ID,
      role: 'customer',
      ...payload
    },
    ACCESS_SECRET,
    {
      expiresIn: '15m',
      issuer: 'kobomarket-api',
      audience: 'kobomarket-client',
      algorithm: 'HS256'
    }
  );
}

// --------------------------------------------------
// HELPER 2: CREATE MOCK EXPRESS OBJECTS
// --------------------------------------------------

function createMockResponse() {
  const res = {};

  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);

  return res;
}

// --------------------------------------------------
// TEST 1: MISSING AUTHORIZATION HEADER
// --------------------------------------------------

test('rejects requests without an Authorization header', async () => {
  const req = {
    headers: {}
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'AUTHENTICATION_REQUIRED'
    })
  );

  expect(next).not.toHaveBeenCalled();

  expect(User.findById).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 2: INVALID BEARER FORMAT
// --------------------------------------------------

test('rejects an invalid Bearer authorization format', async () => {
  const req = {
    headers: {
      authorization: 'Basic sample-token'
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'INVALID_AUTHORIZATION_HEADER'
    })
  );

  expect(next).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 3: EMPTY ACCESS TOKEN
// --------------------------------------------------

test('rejects an empty Bearer access token', async () => {
  const req = {
    headers: {
      authorization: 'Bearer '
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'INVALID_AUTHORIZATION_HEADER'
    })
  );

  expect(next).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 4: MALFORMED JWT
// --------------------------------------------------

test('rejects a malformed access token', async () => {
  const req = {
    headers: {
      authorization: 'Bearer invalid.jwt.token'
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'INVALID_ACCESS_TOKEN'
    })
  );

  expect(next).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 5: EXPIRED JWT
// --------------------------------------------------

test('rejects an expired access token', async () => {
  const expiredToken = jwt.sign(
    {
      sub: USER_ID,
      role: 'customer'
    },
    ACCESS_SECRET,
    {
      expiresIn: -1,
      issuer: 'kobomarket-api',
      audience: 'kobomarket-client'
    }
  );

  const req = {
    headers: {
      authorization: `Bearer ${expiredToken}`
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'INVALID_ACCESS_TOKEN'
    })
  );

  expect(next).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 6: INVALID SIGNATURE
// --------------------------------------------------

test('rejects an access token signed with another secret', async () => {
  const invalidToken = jwt.sign(
    {
      sub: USER_ID,
      role: 'customer'
    },
    'another-secret-with-more-than-32-characters',
    {
      expiresIn: '15m',
      issuer: 'kobomarket-api',
      audience: 'kobomarket-client'
    }
  );

  const req = {
    headers: {
      authorization: `Bearer ${invalidToken}`
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(next).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 7: WRONG JWT ISSUER
// --------------------------------------------------

test('rejects an access token with an incorrect issuer', async () => {
  const invalidToken = jwt.sign(
    {
      sub: USER_ID,
      role: 'customer'
    },
    ACCESS_SECRET,
    {
      expiresIn: '15m',
      issuer: 'another-api',
      audience: 'kobomarket-client'
    }
  );

  const req = {
    headers: {
      authorization: `Bearer ${invalidToken}`
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(next).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 8: WRONG JWT AUDIENCE
// --------------------------------------------------

test('rejects an access token with an incorrect audience', async () => {
  const invalidToken = jwt.sign(
    {
      sub: USER_ID,
      role: 'customer'
    },
    ACCESS_SECRET,
    {
      expiresIn: '15m',
      issuer: 'kobomarket-api',
      audience: 'another-client'
    }
  );

  const req = {
    headers: {
      authorization: `Bearer ${invalidToken}`
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(next).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 9: INVALID USER IDENTIFIER IN TOKEN
// --------------------------------------------------

test('rejects an access token with an invalid user identifier', async () => {
  const invalidToken = createAccessToken({
    sub: 'invalid-user-id'
  });

  const req = {
    headers: {
      authorization: `Bearer ${invalidToken}`
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(next).not.toHaveBeenCalled();

  expect(User.findById).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 10: MISSING USER ID IN TOKEN
// --------------------------------------------------

test('rejects an access token without a user identifier', async () => {
  const invalidToken = jwt.sign(
    {
      role: 'customer'
    },
    ACCESS_SECRET,
    {
      expiresIn: '15m',
      issuer: 'kobomarket-api',
      audience: 'kobomarket-client'
    }
  );

  const req = {
    headers: {
      authorization: `Bearer ${invalidToken}`
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(next).not.toHaveBeenCalled();

  expect(User.findById).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 11: NON-EXISTENT USER
// --------------------------------------------------

test('rejects an access token belonging to a deleted user', async () => {
  User.findById.mockResolvedValue(null);

  const req = {
    headers: {
      authorization: `Bearer ${createAccessToken()}`
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(User.findById).toHaveBeenCalledWith(USER_ID);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'INVALID_ACCESS_TOKEN'
    })
  );

  expect(next).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 12: INACTIVE ACCOUNT
// --------------------------------------------------

test('rejects an access token belonging to an inactive account', async () => {
  User.findById.mockResolvedValue({
    _id: USER_ID,
    role: 'customer',
    isActive: false
  });

  const req = {
    headers: {
      authorization: `Bearer ${createAccessToken()}`
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'ACCOUNT_INACTIVE'
    })
  );

  expect(next).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 13: CHANGED USER ROLE
// --------------------------------------------------

test('rejects an access token when the user role has changed', async () => {
  User.findById.mockResolvedValue({
    _id: USER_ID,
    role: 'admin',
    isActive: true
  });

  const req = {
    headers: {
      authorization: `Bearer ${createAccessToken()}`
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(401);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'INVALID_ACCESS_TOKEN'
    })
  );

  expect(next).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 14: DATABASE FAILURE
// --------------------------------------------------

test('returns a server error when MongoDB authentication lookup fails', async () => {
  User.findById.mockRejectedValue(
    new Error('Simulated MongoDB connection failure.')
  );

  const req = {
    headers: {
      authorization: `Bearer ${createAccessToken()}`
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(res.status).toHaveBeenCalledWith(500);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'AUTHENTICATION_FAILED'
    })
  );

  expect(next).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 15: SUCCESSFUL AUTHENTICATION
// --------------------------------------------------

test('authenticates a valid active customer successfully', async () => {
  const req = {
    headers: {
      authorization: `Bearer ${createAccessToken()}`
    }
  };

  const res = createMockResponse();
  const next = jest.fn();

  await authenticate(req, res, next);

  expect(User.findById).toHaveBeenCalledWith(USER_ID);

  expect(req.user).toEqual({
    id: USER_ID,
    role: 'customer'
  });

  expect(next).toHaveBeenCalledTimes(1);

  expect(res.status).not.toHaveBeenCalled();

  expect(res.json).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 16: JWT CONFIGURATION VALIDATION
// --------------------------------------------------

test('rejects missing JWT access-token configuration', () => {
  delete process.env.JWT_ACCESS_SECRET;

  expect(() => {
    getAccessTokenConfiguration();
  }).toThrow(
    'Authentication server configuration is invalid.'
  );
});

test('rejects identical access and refresh-token secrets', () => {
  process.env.JWT_REFRESH_SECRET = ACCESS_SECRET;

  expect(() => {
    getAccessTokenConfiguration();
  }).toThrow(
    'Authentication server configuration is invalid.'
  );
});

test('rejects weak access-token secrets', () => {
  process.env.JWT_ACCESS_SECRET = 'weak-secret';

  expect(() => {
    getAccessTokenConfiguration();
  }).toThrow(
    'Authentication server configuration is invalid.'
  );
});
