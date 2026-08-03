import { createSignal, For, onCleanup, createEffect } from 'solid-js';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-solidjs';
import './EnhancedToast.css';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
  description?: string;
  duration?: number;
}

let toastId = 0;
const [toasts, setToasts] = createSignal<ToastMessage[]>([]);

// Configuración global
const DEFAULT_DURATION = 5000;
const MAX_TOASTS = 5;

export const toast = {
  show: (message: string, type: ToastType = 'info', options?: { 
    description?: string; 
    duration?: number;
  }) => {
    const id = toastId++;
    const duration = options?.duration ?? DEFAULT_DURATION;
    
    setToasts((prev) => {
      const newToasts = [...prev, { 
        id, 
        message, 
        type, 
        description: options?.description,
        duration 
      }];
      // Limitar número máximo de toasts
      return newToasts.slice(-MAX_TOASTS);
    });

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  },
  
  success: (message: string, description?: string) => 
    toast.show(message, 'success', { description }),
    
  error: (message: string, description?: string) => 
    toast.show(message, 'error', { description }),
    
  info: (message: string, description?: string) => 
    toast.show(message, 'info', { description }),
    
  warning: (message: string, description?: string) => 
    toast.show(message, 'warning', { description }),
    
  dismiss: (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  },
  
  dismissAll: () => {
    setToasts([]);
  },
};

export function EnhancedToastContainer() {
  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success': return <CheckCircle size={20} />;
      case 'error': return <XCircle size={20} />;
      case 'info': return <Info size={20} />;
      case 'warning': return <AlertTriangle size={20} />;
    }
  };

  return (
    <div class="enhanced-toast-container">
      <For each={toasts()}>
        {(toastItem) => (
          <div 
            class={`enhanced-toast enhanced-toast-${toastItem.type}`}
            role="alert"
            aria-live="polite"
          >
            <div class="enhanced-toast-icon">
              {getIcon(toastItem.type)}
            </div>
            
            <div class="enhanced-toast-content">
              <div class="enhanced-toast-message">{toastItem.message}</div>
              {toastItem.description && (
                <div class="enhanced-toast-description">
                  {toastItem.description}
                </div>
              )}
            </div>
            
            <button
              class="enhanced-toast-close"
              onClick={() => toast.dismiss(toastItem.id)}
              aria-label="Cerrar notificación"
            >
              <X size={16} />
            </button>
            
            {/* Barra de progreso */}
            <div 
              class="enhanced-toast-progress"
              style={{ 
                '--toast-duration': `${toastItem.duration}ms`,
                animation: `toast-progress ${toastItem.duration}ms linear`
              }}
            />
          </div>
        )}
      </For>
    </div>
  );
}
