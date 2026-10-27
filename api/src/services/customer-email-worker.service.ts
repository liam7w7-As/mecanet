import { randomUUID } from 'node:crypto';

import nodemailer from 'nodemailer';
import { Op } from 'sequelize';

import { generateCustomerDocumentAttachments } from './customer-document-pdf.service.js';
import { setEmailQueueWakeup } from './customer-email-queue.service.js';
import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { CustomerEmail } from '../models/CustomerEmail.js';
import { Quotation } from '../models/Quotation.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderInspection } from '../models/WorkOrderInspection.js';
import { WorkOrderInspectionPhoto } from '../models/WorkOrderInspectionPhoto.js';
import { logger } from '../utils/logger.js';

import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

let transport: Transporter<SMTPTransport.SentMessageInfo> | undefined;
const getTransport = () => {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: !env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transport;
};

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char] ?? char,
  );

const claimEmail = async (): Promise<CustomerEmail | null> =>
  sequelize.transaction(async (transaction) => {
    const now = new Date();
    const email = await CustomerEmail.findOne({
      where: {
        [Op.or]: [
          {
            status: { [Op.in]: ['pending', 'failed', 'waiting_photos'] },
            attempts: { [Op.lt]: 5 },
            nextAttemptAt: { [Op.lte]: now },
          },
          { status: 'sending', lockedAt: { [Op.lt]: new Date(now.getTime() - 5 * 60_000) } },
        ],
      },
      order: [
        ['nextAttemptAt', 'ASC'],
        ['id', 'ASC'],
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    if (!email) return null;
    if (email.attempts >= 5) {
      await email.update(
        { status: 'failed', lockedAt: null, lockToken: null, lastError: 'RETRY_LIMIT' },
        { transaction },
      );
      return null;
    }
    if (email.status === 'waiting_photos') {
      const inspection = await WorkOrderInspection.findOne({
        where: { workOrderId: email.entityId },
        attributes: ['id'],
        transaction,
      });
      const photos = inspection
        ? await WorkOrderInspectionPhoto.findAll({
            where: { inspectionId: inspection.id },
            attributes: ['slot'],
            transaction,
          })
        : [];
      if (
        !email.payload.expectedPhotoSlots?.every((slot) =>
          photos.some((photo) => photo.slot === slot),
        )
      ) {
        await email.update({ nextAttemptAt: new Date(now.getTime() + 3_000) }, { transaction });
        return null;
      }
    }
    await email.update(
      {
        status: 'sending',
        lockedAt: now,
        lockToken: randomUUID(),
        attempts: email.attempts + 1,
        lastError: null,
      },
      { transaction },
    );
    return email;
  });

export const processCustomerEmailQueue = async (maxJobs = 10): Promise<number> => {
  if (!env.MAIL_ENABLED) return 0;
  let count = 0;
  for (let i = 0; i < maxJobs; i += 1) {
    const email = await claimEmail();
    if (!email) break;
    const claim = { id: email.id, status: 'sending', lockToken: email.lockToken };
    try {
      const exists =
        email.kind === 'quotation'
          ? await Quotation.findByPk(email.entityId, { attributes: ['id'] })
          : await WorkOrder.findByPk(email.entityId, { attributes: ['id'] });
      if (!exists) {
        await CustomerEmail.update(
          { status: 'cancelled', lockedAt: null, lockToken: null },
          { where: claim },
        );
        continue;
      }
      if (!email.recipient)
        throw Object.assign(new Error('Missing recipient'), { code: 'MISSING_RECIPIENT' });
      const attachments =
        email.category === 'document'
          ? await generateCustomerDocumentAttachments(
              email.kind,
              email.entityId,
              email.payload.includeQuotation ?? false,
            )
          : [];
      // Leave room for MIME/base64 overhead under Gmail's attachment limit.
      if (attachments.reduce((sum, file) => sum + file.content.length, 0) > 18 * 1024 * 1024) {
        throw Object.assign(new Error('Attachments too large'), { code: 'ATTACHMENTS_TOO_LARGE' });
      }
      const body =
        email.payload.message ??
        'Adjuntamos su documentación. Gracias por confiar en UNITHOR. Para consultas o coordinaciones puede responder a este correo.';
      const fromAddress = env.MAIL_FROM_ADDRESS ?? env.SMTP_USER ?? '';
      const info = await getTransport().sendMail({
        from: { name: env.MAIL_FROM_NAME, address: fromAddress },
        replyTo: env.MAIL_REPLY_TO ?? fromAddress,
        to: email.recipient,
        subject: email.subject,
        messageId:
          '<unithor-' +
          email.id +
          '-' +
          email.createdAt.getTime() +
          '@' +
          fromAddress.split('@')[1] +
          '>',
        text: 'Hola ' + email.recipientName + ',\n\n' + body + '\n\n' + env.MAIL_FROM_NAME,
        html:
          '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#233047"><div style="background:#0E2B4E;color:white;padding:24px;border-bottom:4px solid #FFD600"><strong>UNITHOR</strong></div><div style="padding:24px"><p>Hola ' +
          escapeHtml(email.recipientName) +
          ',</p><p style="white-space:pre-line;line-height:1.6">' +
          escapeHtml(body) +
          '</p><p>Atentamente,<br><strong>' +
          escapeHtml(env.MAIL_FROM_NAME) +
          '</strong></p></div></div>',
        attachments,
      });
      if (info.accepted.length === 0)
        throw Object.assign(new Error('Recipient rejected'), { code: 'RECIPIENT_REJECTED' });
      await CustomerEmail.update(
        {
          status: 'sent',
          acceptedAt: new Date(),
          lockedAt: null,
          lockToken: null,
          lastError: null,
        },
        { where: claim },
      );
      count += 1;
    } catch (error: unknown) {
      // Never store/log credentials, SMTP transcripts or a server echo containing private data.
      const failure = error as { code?: string; responseCode?: number };
      const code = (failure.code ?? 'SEND_FAILED').replace(/[^A-Z0-9_]/gi, '').slice(0, 60);
      await CustomerEmail.update(
        {
          status: 'failed',
          lastError: code,
          lockedAt: null,
          lockToken: null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(60 * 60_000, 30_000 * 2 ** (email.attempts - 1)),
          ),
        },
        { where: claim },
      );
      logger.warn(
        { emailId: email.id, code, responseCode: failure.responseCode },
        'No se pudo enviar el correo al cliente; se conserva para reintento',
      );
    }
  }
  return count;
};

export const startCustomerEmailWorker = (): (() => void) => {
  let stopped = false;
  let running = false;
  let scheduled: NodeJS.Immediate | undefined;
  const run = (): void => {
    if (stopped || running || !env.MAIL_ENABLED) return;
    running = true;
    void processCustomerEmailQueue()
      .catch(() => logger.warn('No se pudo procesar la cola de correo'))
      .finally(() => {
        running = false;
      });
  };
  const wake = (): void => {
    if (stopped || scheduled) return;
    scheduled = setImmediate(() => {
      scheduled = undefined;
      run();
    });
  };
  setEmailQueueWakeup(wake);
  const timer = setInterval(run, 3_000);
  timer.unref();
  wake();
  return () => {
    stopped = true;
    clearInterval(timer);
    if (scheduled) clearImmediate(scheduled);
    setEmailQueueWakeup(undefined);
    transport?.close();
  };
};

export const verifyCustomerEmailTransport = async (): Promise<void> => {
  if (!env.MAIL_ENABLED) throw new Error('MAIL_ENABLED=false');
  await getTransport().verify();
};
