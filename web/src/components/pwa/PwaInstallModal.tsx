import { Download, MoreVertical, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { DevicePlatform } from '../../hooks/usePwaInstall';

interface PwaInstallModalProps {
  isOpen: boolean;
  platform: DevicePlatform;
  onClose: () => void;
}

export const PwaInstallModal = ({ isOpen, platform, onClose }: PwaInstallModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Fondo oscuro traslúcido */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Tarjeta modal */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            {/* Botón cerrar */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Cabecera */}
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#18335c] text-white shadow-md">
                <Download className="h-6 w-6" />
              </div>
              <div>
                <h3 id="pwa-install-title" className="text-base font-bold text-[#18335c]">
                  Instalar UNITHOR
                </h3>
                <p className="text-xs text-slate-500">
                  Acceso directo y experiencia de app nativa en tu dispositivo
                </p>
              </div>
            </div>

            {/* Pasos según plataforma */}
            <div className="mt-5 space-y-3">
              {platform === 'ios' ? (
                <>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-slate-700">
                    <p className="font-semibold text-blue-900 mb-1">
                      📱 Instrucciones para iPhone / iPad (Safari):
                    </p>
                    <ol className="mt-2 space-y-2.5 list-none pl-0">
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18335c] text-[11px] font-bold text-white">
                          1
                        </span>
                        <span>
                          En la barra inferior de <strong>Safari</strong>, toca el botón de <strong>Compartir</strong>{' '}
                          <Share className="inline h-3.5 w-3.5 text-blue-600 align-text-bottom" />.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18335c] text-[11px] font-bold text-white">
                          2
                        </span>
                        <span>
                          Desliza hacia abajo en el menú y selecciona{' '}
                          <strong>&quot;Agregar a pantalla de inicio&quot;</strong>{' '}
                          <PlusSquare className="inline h-3.5 w-3.5 text-slate-700 align-text-bottom" />.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18335c] text-[11px] font-bold text-white">
                          3
                        </span>
                        <span>
                          Toca <strong>&quot;Agregar&quot;</strong> en la esquina superior derecha y ¡listo!
                        </span>
                      </li>
                    </ol>
                  </div>
                </>
              ) : platform === 'android' ? (
                <>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-slate-700">
                    <p className="font-semibold text-blue-900 mb-1">
                      🤖 Instrucciones para Android (Chrome):
                    </p>
                    <ol className="mt-2 space-y-2.5 list-none pl-0">
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18335c] text-[11px] font-bold text-white">
                          1
                        </span>
                        <span>
                          Toca el menú de opciones{' '}
                          <strong>(tres puntos <MoreVertical className="inline h-3.5 w-3.5 text-slate-700 align-text-bottom" />)</strong>{' '}
                          en la esquina superior derecha del navegador.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18335c] text-[11px] font-bold text-white">
                          2
                        </span>
                        <span>
                          Selecciona <strong>&quot;Instalar aplicación&quot;</strong> (o <strong>&quot;Instalar UNITHOR&quot;</strong>).
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18335c] text-[11px] font-bold text-white">
                          3
                        </span>
                        <span>
                          Confirma en el cuadro de diálogo y Android la instalará como una aplicación real en tu dispositivo.
                        </span>
                      </li>
                    </ol>
                    <p className="mt-2.5 text-[11px] text-blue-800">
                      💡 <em>Consejo: Asegúrate de elegir <strong>&quot;Instalar aplicación&quot;</strong> (no &quot;Acceso directo&quot;) para que se instale con su propio icono sin barra de navegador.</em>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-slate-700">
                    <p className="font-semibold text-blue-900 mb-1">
                      💻 Instrucciones para Computadora (Chrome / Edge):
                    </p>
                    <ol className="mt-2 space-y-2.5 list-none pl-0">
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18335c] text-[11px] font-bold text-white">
                          1
                        </span>
                        <span>
                          Haz clic en el icono <strong>⊕ (Instalar)</strong> ubicado al extremo derecho de la barra de direcciones de tu navegador.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18335c] text-[11px] font-bold text-white">
                          2
                        </span>
                        <span>
                          O haz clic en el menú <strong>(tres puntos ⋮)</strong> de Chrome/Edge y selecciona{' '}
                          <strong>&quot;Instalar UNITHOR&quot;</strong>.
                        </span>
                      </li>
                    </ol>
                  </div>
                </>
              )}

              {/* Beneficios rápidos */}
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                <Smartphone className="h-4 w-4 text-[#18335c] shrink-0" />
                <span>La app se abrirá en pantalla completa y responderá mucho más rápido.</span>
              </div>
            </div>

            {/* Botón de acción */}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-[#18335c] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#204379] active:scale-95"
              >
                Entendido
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PwaInstallModal;
