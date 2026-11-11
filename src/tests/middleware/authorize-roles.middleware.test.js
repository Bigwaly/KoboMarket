
const {
  authorizeRoles,
  ALLOWED_ROLES
} = require('../../middleware/authorize-roles.middleware');

// Create a mock Express response object.
function createMockResponse() {
  const res = {};

  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);

  return res;
}

describe('Role-based authorization middleware', () => {

  // STEP 1: Confirm all supported roles are defined.
  test('exports all supported application roles', () => {
    expect(ALLOWED_ROLES).toEqual([
      'customer',
      'vendor',
      'admin',
      'superadmin'
    ]);
  });

  // STEP 2: Reject middleware created without any roles.
  test('rejects an empty list of allowed roles', () => {
    expect(() => authorizeRoles()).toThrow(
      'Authorization middleware requires valid allowed roles.'
    );
  });

  // STEP 3: Reject unsupported roles.
  test('rejects an unsupported role', () => {
    expect(() => authorizeRoles('manager')).toThrow(
      'Authorization middleware requires valid allowed roles.'
    );
  });

  // STEP 4: Reject invalid role data types.
  test('rejects a non-string role', () => {
    expect(() => authorizeRoles(123)).toThrow(
      'Authorization middleware requires valid allowed roles.'
    );
  });

  // STEP 5: Reject mixed valid and invalid roles.
  test('rejects a list containing an unsupported role', () => {
    expect(() => authorizeRoles('admin', 'manager')).toThrow(
      'Authorization middleware requires valid allowed roles.'
    );
  });

  // STEP 6: Reject requests without authenticated user information.
  test('rejects requests without req.user', () => {
    const middleware = authorizeRoles('admin');
    const req = {};
    const res = createMockResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Authentication is required to access this resource.',
      code: 'AUTHENTICATION_REQUIRED'
    });

    expect(next).not.toHaveBeenCalled();
  });

  // STEP 7: Reject incomplete authenticated user information.
  test('rejects a user without an identifier', () => {
    const middleware = authorizeRoles('admin');
    const req = {
      user: {
        role: 'admin'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  // STEP 8: Reject a user without a role.
  test('rejects a user without a role', () => {
    const middleware = authorizeRoles('admin');
    const req = {
      user: {
        id: '507f1f77bcf86cd799439011'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  // STEP 9: Reject users whose roles are not permitted.
  test('rejects a customer accessing an admin-only route', () => {
    const middleware = authorizeRoles('admin');
    const req = {
      user: {
        id: '507f1f77bcf86cd799439011',
        role: 'customer'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'You do not have permission to access this resource.',
      code: 'INSUFFICIENT_PERMISSIONS'
    });

    expect(next).not.toHaveBeenCalled();
  });

  // STEP 10: Allow a user with the exact required role.
  test('allows an admin to access an admin-only route', () => {
    const middleware = authorizeRoles('admin');
    const req = {
      user: {
        id: '507f1f77bcf86cd799439011',
        role: 'admin'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  // STEP 11: Allow a superadmin where admin access is permitted.
  test('allows a superadmin to access an admin or superadmin route', () => {
    const middleware = authorizeRoles('admin', 'superadmin');
    const req = {
      user: {
        id: '507f1f77bcf86cd799439011',
        role: 'superadmin'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  // STEP 12: Allow a vendor on vendor-only routes.
  test('allows a vendor to access a vendor-only route', () => {
    const middleware = authorizeRoles('vendor');
    const req = {
      user: {
        id: '507f1f77bcf86cd799439011',
        role: 'vendor'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  // STEP 13: Allow a customer on customer-only routes.
  test('allows a customer to access a customer-only route', () => {
    const middleware = authorizeRoles('customer');
    const req = {
      user: {
        id: '507f1f77bcf86cd799439011',
        role: 'customer'
      }
    };
    const res = createMockResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

});
