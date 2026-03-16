const crypto = require("crypto");

describe("PayFastProvider", () => {
  let setMock;

  beforeEach(() => {
    jest.resetModules();
    setMock = jest.fn().mockResolvedValue(undefined);

    process.env.PAYFAST_MERCHANT_ID = "10000100";
    process.env.PAYFAST_MERCHANT_KEY = "46f0cd694581a";
    process.env.PAYFAST_PASSPHRASE = "secret pass";
    process.env.PAYFAST_MODE = "sandbox";

    jest.doMock("../src/firebaseAdmin", () => ({
      db: {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            set: setMock,
          })),
        })),
      },
    }));
  });

  afterEach(() => {
    delete process.env.PAYFAST_MERCHANT_ID;
    delete process.env.PAYFAST_MERCHANT_KEY;
    delete process.env.PAYFAST_PASSPHRASE;
    delete process.env.PAYFAST_MODE;
  });

  test("builds signatures with PayFast ordering and plus-encoded spaces", () => {
    const { buildPayfastSignature } = require("../src/services/payments/payfastProvider");

    const params = {
      merchant_id: "10000100",
      merchant_key: "46f0cd694581a",
      return_url: "https://example.com/success",
      cancel_url: "https://example.com/cancel",
      notify_url: "https://example.com/notify",
      m_payment_id: "pf_123",
      amount: "49.00",
      item_name: "Video Credits",
      custom_str1: "user 1",
      custom_str2: "starter pack",
    };

    const expectedString =
      "merchant_id=10000100&merchant_key=46f0cd694581a&return_url=https%3A%2F%2Fexample.com%2Fsuccess&cancel_url=https%3A%2F%2Fexample.com%2Fcancel&notify_url=https%3A%2F%2Fexample.com%2Fnotify&m_payment_id=pf_123&amount=49.00&item_name=Video+Credits&custom_str1=user+1&custom_str2=starter+pack&passphrase=secret+pass";
    const expectedSignature = crypto.createHash("md5").update(expectedString, "utf8").digest("hex");

    expect(buildPayfastSignature(params, "secret pass")).toBe(expectedSignature);
  });

  test("creates orders with custom metadata and verifies uppercase notification signatures", async () => {
    const {
      PayFastProvider,
      buildPayfastSignature,
    } = require("../src/services/payments/payfastProvider");
    const provider = new PayFastProvider();

    const created = await provider.createOrder({
      amount: 49,
      returnUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      notifyUrl: "https://example.com/notify",
      metadata: {
        m_payment_id: "pf_456",
        item_name: "Video Credits",
        custom_str1: "user-123",
        custom_str2: "package-789",
      },
    });

    expect(created.success).toBe(true);
    expect(created.order.params.custom_str1).toBe("user-123");
    expect(created.order.params.custom_str2).toBe("package-789");
    expect(setMock).toHaveBeenCalled();

    const notification = {
      merchant_id: created.order.params.merchant_id,
      merchant_key: created.order.params.merchant_key,
      return_url: created.order.params.return_url,
      cancel_url: created.order.params.cancel_url,
      notify_url: created.order.params.notify_url,
      m_payment_id: created.order.params.m_payment_id,
      amount: created.order.params.amount,
      item_name: created.order.params.item_name,
      custom_str1: created.order.params.custom_str1,
      custom_str2: created.order.params.custom_str2,
    };

    const uppercaseSignature = buildPayfastSignature(notification, "secret pass").toUpperCase();
    const verified = await provider.verifyNotification({
      body: {
        ...notification,
        signature: uppercaseSignature,
      },
    });

    expect(verified.verified).toBe(true);
  });
});
