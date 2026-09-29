import { useEffect, useState } from 'react';

import { getUserAvatarUrl } from '../../lib/user-avatar';
import { cn } from '../../lib/utils';

export interface UserAvatarProps {
  user?: {
    id?: number;
    nombre?: string;
    email?: string;
    avatarUrl?: string;
    foto_url?: string;
  } | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  ring?: 'none' | 'primary' | 'modernize';
  className?: string;
  alt?: string;
  onClick?: () => void;
}

const SIZE_CLASSES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
  '2xl': 'h-24 w-24 text-2xl',
} as const;

const getInitials = (name?: string): string => {
  if (!name) return 'U';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
};

/**
 * Componente UserAvatar con soporte para avatares de la plantilla Modernize,
 * fallback automático a iniciales y estilo de anillo característico de Modernize.
 */
export const UserAvatar = ({
  user,
  size = 'md',
  ring = 'none',
  className,
  alt,
  onClick,
}: UserAvatarProps) => {
  const [avatarSrc, setAvatarSrc] = useState<string>(() => getUserAvatarUrl(user));
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setAvatarSrc(getUserAvatarUrl(user));
    setImageFailed(false);
  }, [user]);

  // Escuchar cambios de avatar en vivo cuando el usuario actualice su foto en el perfil
  useEffect(() => {
    const handleAvatarChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId?: number; avatarName?: string }>;
      if (!user?.id || user.id === customEvent.detail?.userId) {
        setAvatarSrc(getUserAvatarUrl(user));
        setImageFailed(false);
      }
    };

    window.addEventListener('unithor_avatar_changed', handleAvatarChange);
    return () => {
      window.removeEventListener('unithor_avatar_changed', handleAvatarChange);
    };
  }, [user]);

  const sizeClass = SIZE_CLASSES[size];
  const displayName = user?.nombre ?? 'Usuario';
  const labelAlt = alt ?? displayName;

  // Anillos de Modernize
  let ringClasses = '';
  if (ring === 'primary') {
    ringClasses = 'ring-2 ring-brand-primary ring-offset-2 ring-offset-white';
  } else if (ring === 'modernize') {
    ringClasses =
      'border-[3px] border-brand-primary border-b-brand-coral border-r-brand-coral p-[3px] bg-white shadow-md';
  }

  if (imageFailed) {
    return (
      <div
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-brand-primary to-brand-cyan font-bold text-white shadow-sm select-none',
          sizeClass,
          ringClasses,
          className,
        )}
        title={displayName}
        onClick={onClick}
      >
        {getInitials(user?.nombre)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative inline-block shrink-0 rounded-full overflow-hidden',
        sizeClass,
        ringClasses,
        className,
      )}
      onClick={onClick}
    >
      <img
        src={avatarSrc}
        alt={labelAlt}
        onError={() => setImageFailed(true)}
        className="h-full w-full rounded-full object-cover"
        loading="lazy"
      />
    </div>
  );
};

export default UserAvatar;
