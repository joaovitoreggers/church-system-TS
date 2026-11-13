export abstract class MailService {
  abstract sendPasswordReset(to: string, resetUrl: string): Promise<void>;
}
