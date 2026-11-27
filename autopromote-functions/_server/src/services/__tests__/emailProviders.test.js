const mockSendMail = jest.fn(async () => ({ messageId: "zepto-message-1" }));
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));

jest.mock("nodemailer", () => ({ createTransport: mockCreateTransport }));

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

describe("emailProviders", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ZEPTOMAIL_API_KEY;
    delete process.env.ZEPTOMAIL_SEND_MAIL_TOKEN;
    delete process.env.ZEPTOMAIL_API_URL;
    delete process.env.ZEPTOMAIL_FROM_EMAIL;
    delete process.env.ZEPTOMAIL_FROM_NAME;
    delete process.env.EMAIL_FROM;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  it("uses the ZeptoMail REST API defaults with a Send Mail Token", async () => {
    process.env.EMAIL_PROVIDER = "zeptomail";
    process.env.ZEPTOMAIL_SEND_MAIL_TOKEN = "test-send-mail-token";
    process.env.ZEPTOMAIL_FROM_EMAIL = "admin@autopromote.org";

    const apiFetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ data: [{ message_id: "zepto-message-1" }] }),
    }));
    global.fetch = apiFetch;

    const { getEmailProvider } = require("../emailProviders");
    const provider = getEmailProvider();
    const result = await provider.send({
      to: "tester@example.com",
      subject: "Tester access",
      htmlbody: "<p>Ready</p>",
    });

    expect(provider.name).toBe("zeptomail");
    expect(apiFetch).toHaveBeenCalledWith(
      "https://api.zeptomail.com/v1.1/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Zoho-enczapikey test-send-mail-token",
        }),
      })
    );
    expect(result).toEqual({ ok: true, provider: "zeptomail", id: "zepto-message-1" });
  });

  it("keeps email external delivery disabled when ZeptoMail credentials are absent", () => {
    process.env.EMAIL_PROVIDER = "zeptomail";
    const { getEmailProvider } = require("../emailProviders");
    expect(getEmailProvider().name).toBe("console");
  });
});
