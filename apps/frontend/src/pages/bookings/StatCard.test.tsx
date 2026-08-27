import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BookmarkCheck, Clock, AlertTriangle } from 'lucide-react';
import { StatCard } from './StatCard';

describe('StatCard — content', () => {
  it('renders title', () => {
    render(<StatCard title="Đang giữ" value={5} icon={BookmarkCheck} />);
    expect(screen.getByText('Đang giữ')).toBeInTheDocument();
  });

  it('renders numeric value', () => {
    render(<StatCard title="Total" value={42} icon={BookmarkCheck} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders string value', () => {
    render(<StatCard title="Rate" value="98%" icon={BookmarkCheck} />);
    expect(screen.getByText('98%')).toBeInTheDocument();
  });

  it('renders sub text when provided', () => {
    render(<StatCard title="Sắp hết hạn" value={3} sub="trong 7 ngày" icon={Clock} />);
    expect(screen.getByText('trong 7 ngày')).toBeInTheDocument();
  });

  it('omits sub element when sub is not provided', () => {
    render(<StatCard title="Total" value={10} icon={BookmarkCheck} />);
    expect(screen.queryByText('trong 7 ngày')).not.toBeInTheDocument();
  });

  it('renders badge text when badge prop provided', () => {
    render(<StatCard title="Total" value={10} icon={BookmarkCheck} badge="Mới nhất" />);
    expect(screen.getByText('Mới nhất')).toBeInTheDocument();
  });

  it('omits badge when badge prop not provided', () => {
    const { container } = render(<StatCard title="Total" value={10} icon={BookmarkCheck} />);
    // No badge secondary element rendered
    const badges = container.querySelectorAll('[class*="secondary"]');
    expect(badges.length).toBe(0);
  });
});

describe('StatCard — icons and colors', () => {
  it('renders without error for each color variant', () => {
    const colors = ['blue', 'green', 'yellow', 'red', 'purple', 'teal'];
    colors.forEach((color) => {
      expect(() =>
        render(<StatCard title="Test" value={1} icon={BookmarkCheck} color={color} />),
      ).not.toThrow();
    });
  });

  it('renders different icon components without throwing', () => {
    expect(() => render(<StatCard title="Test" value={1} icon={Clock} />)).not.toThrow();
    expect(() => render(<StatCard title="Test" value={1} icon={AlertTriangle} />)).not.toThrow();
  });

  it('uses blue as default color without throwing', () => {
    expect(() => render(<StatCard title="Test" value={0} icon={BookmarkCheck} />)).not.toThrow();
  });
});
