import { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
};

export default function SectionTitle({ children, right, className = '' }: Props) {
  return (
    <div className={['flex items-center justify-between px-1', className].join(' ')}>
      <h2 className="font-heading text-base text-foreground/90 tracking-wide">{children}</h2>
      {right}
    </div>
  );
}
