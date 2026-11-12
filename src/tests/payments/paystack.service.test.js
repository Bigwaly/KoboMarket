/**
 * PAYSTACK SERVICE TESTS
 *
 * These tests verify transaction initialization and verification
 * without making real requests to Paystack.
 */

// Import the Paystack service functions.
const {
  initializePaystackTransaction,
  verifyPaystackTransaction
} = require('../../modules/payments/services/paystack.service');

// Preserve the original environment configuration.
const originalSecretKey = process.env.PAYSTACK_SECRET_KEY;
const originalBaseUrl = process.env.PAYSTACK_BASE_URL;

// Preserve the original fetch implementation.
const originalFetch = global.fetch;

// Reusable verified transaction data.
const fakeVerifiedTransaction = {
  reference: 'KM-PAY-TEST-001',
  status: 'success',
  amount: 150000,
  currency: 'NGN',
  customer: {
    email: 'customer@example.com'
  }
};

// Prepare the environment before every test.
beforeEach(() => {
  jest.clearAllMocks();

  process.env.PAYSTACK_SECRET_KEY = 'sk_test_fake_secret_key';
  process.env.PAYSTACK_BASE_URL = 'https://api.paystack.co';

  global.fetch = jest.fn();
});

// Restore the original environment after every test.
afterEach(() => {
  if (originalSecretKey === undefined) {
    delete process.env.PAYSTACK_SECRET_KEY;
  } else {
    process.env.PAYSTACK_SECRET_KEY = originalSecretKey;
  }

  if (originalBaseUrl === undefined) {
    delete process.env.PAYSTACK_BASE_URL;
  } else {
    process.env.PAYSTACK_BASE_URL = originalBaseUrl;
  }

  global.fetch = originalFetch;
});

// Helper for creating simulated Paystack responses.
function createResponse({
  ok = true,
  status = 200,
  body
}) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body)
  };
}

// --------------------------------------------------
// TRANSACTION VERIFICATION TESTS
// --------------------------------------------------

test('verifies a transaction successfully', async () => {
  global.fetch.mockResolvedValue(
    createResponse({
      body: {
        status: true,
        message: 'Verification successful',
        data: fakeVerifiedTransaction
      }
    })
  );

  const result = await verifyPaystackTransaction({
    reference: fakeVerifiedTransaction.reference
  });

  expect(global.fetch).toHaveBeenCalledWith(
    'https://api.paystack.co/transaction/verify/KM-PAY-TEST-001',
    expect.objectContaining({
      method: 'GET',
      headers: {
        Authorization: 'Bearer sk_test_fake_secret_key',
        'Content-Type': 'application/json'
      }
    })
  );

  expect(result).toEqual(fakeVerifiedTransaction);
});

test('rejects an empty transaction reference', async () => {
  await expect(
    verifyPaystackTransaction({
      reference: ''
    })
  ).rejects.toMatchObject({
    code: 'INVALID_PAYMENT_REFERENCE',
    statusCode: 400,
    definitive: true
  });

  expect(global.fetch).not.toHaveBeenCalled();
});

test('rejects a transaction reference longer than 150 characters', async () => {
  await expect(
    verifyPaystackTransaction({
      reference: 'A'.repeat(151)
    })
  ).rejects.toMatchObject({
    code: 'INVALID_PAYMENT_REFERENCE'
  });

  expect(global.fetch).not.toHaveBeenCalled();
});

test('rejects verification when the Paystack secret is missing', async () => {
  delete process.env.PAYSTACK_SECRET_KEY;

  await expect(
    verifyPaystackTransaction({
      reference: fakeVerifiedTransaction.reference
    })
  ).rejects.toMatchObject({
    code: 'PAYSTACK_NOT_CONFIGURED',
    statusCode: 503
  });

  expect(global.fetch).not.toHaveBeenCalled();
});

test('handles a Paystack network failure', async () => {
  global.fetch.mockRejectedValue(
    new Error('Network unavailable')
  );

  await expect(
    verifyPaystackTransaction({
      reference: fakeVerifiedTransaction.reference
    })
  ).rejects.toMatchObject({
    code: 'PAYSTACK_NETWORK_ERROR',
    statusCode: 503,
    definitive: false
  });
});

test('handles an unreadable Paystack response', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockRejectedValue(
      new Error('Invalid JSON')
    )
  });

  await expect(
    verifyPaystackTransaction({
      reference: fakeVerifiedTransaction.reference
    })
  ).rejects.toMatchObject({
    code: 'PAYSTACK_INVALID_RESPONSE',
    statusCode: 502,
    definitive: false
  });
});

test('handles a Paystack HTTP server error', async () => {
  global.fetch.mockResolvedValue(
    createResponse({
      ok: false,
      status: 500,
      body: {
        status: false,
        message: 'Internal server error'
      }
    })
  );

  await expect(
    verifyPaystackTransaction({
      reference: fakeVerifiedTransaction.reference
    })
  ).rejects.toMatchObject({
    code: 'PAYSTACK_VERIFICATION_HTTP_ERROR',
    statusCode: 502,
    definitive: false
  });
});

test('rejects an unsuccessful Paystack verification response', async () => {
  global.fetch.mockResolvedValue(
    createResponse({
      body: {
        status: false,
        message: 'Transaction not found',
        data: null
      }
    })
  );

  await expect(
    verifyPaystackTransaction({
      reference: fakeVerifiedTransaction.reference
    })
  ).rejects.toMatchObject({
    code: 'PAYSTACK_VERIFICATION_REJECTED',
    statusCode: 502
  });
});

test('rejects a mismatched transaction reference', async () => {
  global.fetch.mockResolvedValue(
    createResponse({
      body: {
        status: true,
        data: {
          ...fakeVerifiedTransaction,
          reference: 'A-DIFFERENT-REFERENCE'
        }
      }
    })
  );

  await expect(
    verifyPaystackTransaction({
      reference: fakeVerifiedTransaction.reference
    })
  ).rejects.toMatchObject({
    code: 'PAYSTACK_REFERENCE_MISMATCH',
    statusCode: 502,
    definitive: false
  });
});
