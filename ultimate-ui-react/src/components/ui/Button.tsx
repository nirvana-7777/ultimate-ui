import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className = '', children, ...rest }, ref) => {
    const cls =
      variant === 'primary'
        ? 'btn-play'
        : variant === 'danger'
        ? 'btn-catchup-download'
        : 'btn-reminder';
    return (
      <button ref={ref} className={`${cls} ${className}`} {...rest}>
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
