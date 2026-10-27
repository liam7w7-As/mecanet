import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { BrandingSnapshotProvider } from './BrandingContext';
import { OfficialDocumentSheets } from './PdfPreviewModal';
import { api } from '../../lib/api';
import { renderOfficialPdf } from '../../lib/official-pdf';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { Quotation, WorkOrder } from '../../types/entities';
import type { PublicBranding } from '@unithor/shared';

const listSchema = z.object({
  enabled: z.boolean(),
  jobs: z.array(z.object({ id: z.number().int().positive() })),
});
interface EmailDocument {
  type: 'work-order' | 'quotation';
  id: number;
  filename: string;
  workOrder?: WorkOrder;
  quotation?: Quotation;
}
interface Preparation {
  id: number;
  revision: string;
  branding: PublicBranding;
  documents: EmailDocument[];
}
const queryKey = ['customer-email-preparation'];

function PrepareOfficialEmail({
  bundle,
  onComplete,
  onError,
}: {
  bundle: Preparation;
  onComplete: (id: number) => void;
  onError: (id: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const form = new FormData();
        form.append('revision', bundle.revision);
        for (const document of bundle.documents) {
          const container = root.current?.querySelector<HTMLElement>(
            '[data-email-document="' + document.type + '-' + document.id + '"]',
          );
          if (!container || cancelled) return;
          const pdf = await renderOfficialPdf(container, { background: true });
          const expectedPhotos =
            document.type === 'work-order'
              ? (document.workOrder?.inspection?.photos.length ?? 0)
              : (document.quotation?.workOrder?.inspectionPhotos?.length ?? 0);
          if (container.querySelectorAll('[data-inspection-photo]').length !== expectedPhotos) {
            throw new Error('El registro fotográfico del PDF está incompleto');
          }
          form.append('documents', pdf, document.filename);
        }
        if (cancelled) return;
        await api.post('/customer-emails/preparation/' + bundle.id, form);
        if (!cancelled) onComplete(bundle.id);
      } catch {
        if (!cancelled) onError(bundle.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bundle, onComplete, onError]);
  return (
    <BrandingSnapshotProvider branding={bundle.branding}>
      <div
        ref={root}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: -10000,
          top: 0,
          width: 816,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        {bundle.documents.map((document) => (
          <div
            key={document.type + document.id}
            data-email-document={document.type + '-' + document.id}
          >
            <OfficialDocumentSheets
              type={document.type}
              workOrder={document.workOrder}
              quotation={document.quotation}
            />
          </div>
        ))}
      </div>
    </BrandingSnapshotProvider>
  );
}

/** The durable job survives navigation/reloads; only approved UI sheets are attached. */
export default function CustomerEmailPreparation() {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const [active, setActive] = useState<Preparation | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const processed = useRef(new Set<number>());
  const retryAfter = useRef(new Map<number, number>());
  const allowed = Boolean(
    user &&
    user.role !== 'mecanico' &&
    (hasUserPermission(user, 'taller', 'read') || hasUserPermission(user, 'comercial', 'read')),
  );
  const query = useQuery({
    queryKey: [...queryKey, user?.id],
    enabled: allowed,
    retry: false,
    queryFn: async () => listSchema.parse((await api.get('/customer-emails/preparation')).data),
    refetchInterval: (state) => (state.state.data?.enabled === false ? 30_000 : 5_000),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const complete = useCallback(
    (id: number) => {
      processed.current.add(id);
      busy.current = false;
      setActive(null);
      void client.invalidateQueries({ queryKey });
      void client.invalidateQueries({ queryKey: ['customer-emails'] });
    },
    [client],
  );
  const fail = useCallback(
    (id: number) => {
      retryAfter.current.set(id, Date.now() + 30_000);
      busy.current = false;
      setActive(null);
      void api
        .post('/customer-emails/preparation/' + id + '/error')
        .catch(() => undefined)
        .finally(() => {
          void client.invalidateQueries({ queryKey: ['customer-emails'] });
        });
    },
    [client],
  );
  useEffect(() => {
    if (!allowed || busy.current) return;
    const job = query.data?.jobs.find(
      (candidate) =>
        !processed.current.has(candidate.id) &&
        (retryAfter.current.get(candidate.id) ?? 0) <= Date.now(),
    );
    if (!job) return;
    busy.current = true;
    void api
      .get<Preparation>('/customer-emails/preparation/' + job.id)
      .then(({ data }) => {
        if (!alive.current) return;
        if (!data.revision || !Array.isArray(data.documents) || !data.documents.length)
          throw new Error('Preparación inválida');
        setActive(data);
      })
      .catch(() => {
        if (alive.current) fail(job.id);
      });
  }, [allowed, query.data, fail]);
  return active ? (
    <PrepareOfficialEmail bundle={active} onComplete={complete} onError={fail} />
  ) : null;
}
