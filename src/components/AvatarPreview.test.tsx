import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AvatarPreview from './AvatarPreview';

describe('AvatarPreview', () => {
  it('renders the fallback icon when src is null', () => {
    render(<AvatarPreview src={null} />);
    expect(screen.getByTestId('avatar-preview-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-preview-img')).not.toBeInTheDocument();
  });

  it('renders an <img> with the given data: URL', () => {
    const dataUrl = 'data:image/png;base64,AAAA';
    render(<AvatarPreview src={dataUrl} />);
    const img = screen.getByTestId('avatar-preview-img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(dataUrl);
  });

  it('renders an <img> with a blob: URL', () => {
    const blobUrl = 'blob:http://localhost/abc';
    render(<AvatarPreview src={blobUrl} />);
    const img = screen.getByTestId('avatar-preview-img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(blobUrl);
  });

  it('renders an <img> with a remote server URL', () => {
    const url = 'https://cdn.example.com/a.jpg?t=1';
    render(<AvatarPreview src={url} />);
    const img = screen.getByTestId('avatar-preview-img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(url);
  });

  it('falls back to the icon when the image fails to load', () => {
    render(<AvatarPreview src="https://cdn.example.com/broken.jpg" />);
    const img = screen.getByTestId('avatar-preview-img');
    fireEvent.error(img);
    expect(screen.getByTestId('avatar-preview-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-preview-img')).not.toBeInTheDocument();
  });

  it('recovers when src changes after a broken preview', () => {
    const { rerender } = render(
      <AvatarPreview src="https://cdn.example.com/broken.jpg" />,
    );
    fireEvent.error(screen.getByTestId('avatar-preview-img'));
    expect(screen.getByTestId('avatar-preview-fallback')).toBeInTheDocument();

    rerender(<AvatarPreview src="data:image/png;base64,BBBB" />);
    expect(screen.getByTestId('avatar-preview-img')).toBeInTheDocument();
  });
});
