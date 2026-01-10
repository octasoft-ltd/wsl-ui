import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input, TextArea, Select } from './Input';

describe('Input', () => {
  describe('rendering', () => {
    it('renders with label', () => {
      render(<Input label="Email" />);
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    it('renders without label', () => {
      render(<Input placeholder="Enter text" />);
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });

    it('renders with helper text', () => {
      render(<Input label="Email" helperText="We'll never share your email" />);
      expect(screen.getByText("We'll never share your email")).toBeInTheDocument();
    });

    it('renders with error message', () => {
      render(<Input label="Email" error="Invalid email address" />);
      expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    });
  });

  describe('states', () => {
    it('handles value changes', () => {
      const handleChange = vi.fn();
      render(<Input label="Name" onChange={handleChange} />);
      const input = screen.getByLabelText('Name');
      fireEvent.change(input, { target: { value: 'John' } });
      expect(handleChange).toHaveBeenCalled();
    });

    it('applies disabled state', () => {
      render(<Input label="Name" disabled />);
      expect(screen.getByLabelText('Name')).toBeDisabled();
    });

    it('applies readonly state', () => {
      render(<Input label="Name" readOnly value="John" />);
      const input = screen.getByLabelText('Name');
      expect(input).toHaveAttribute('readonly');
    });

    it('applies error styles when error is present', () => {
      render(<Input label="Email" error="Invalid" />);
      const input = screen.getByLabelText('Email');
      expect(input).toHaveClass('border-theme-status-error');
    });
  });

  describe('sizes', () => {
    it('applies default size', () => {
      render(<Input label="Name" />);
      const input = screen.getByLabelText('Name');
      expect(input).toHaveClass('py-2');
    });

    it('applies small size', () => {
      render(<Input label="Name" size="sm" />);
      const input = screen.getByLabelText('Name');
      expect(input).toHaveClass('py-1.5');
    });
  });

  describe('with icon/addon', () => {
    it('renders with left addon', () => {
      render(<Input label="Amount" leftAddon="$" />);
      expect(screen.getByText('$')).toBeInTheDocument();
    });

    it('renders with right addon', () => {
      render(<Input label="Website" rightAddon=".com" />);
      expect(screen.getByText('.com')).toBeInTheDocument();
    });
  });
});

describe('TextArea', () => {
  it('renders with label', () => {
    render(<TextArea label="Description" />);
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('renders with rows', () => {
    render(<TextArea label="Description" rows={5} />);
    const textarea = screen.getByLabelText('Description');
    expect(textarea).toHaveAttribute('rows', '5');
  });

  it('handles value changes', () => {
    const handleChange = vi.fn();
    render(<TextArea label="Description" onChange={handleChange} />);
    const textarea = screen.getByLabelText('Description');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('applies error styles', () => {
    render(<TextArea label="Description" error="Required" />);
    const textarea = screen.getByLabelText('Description');
    expect(textarea).toHaveClass('border-theme-status-error');
  });
});

describe('Select', () => {
  const options = [
    { value: 'opt1', label: 'Option 1' },
    { value: 'opt2', label: 'Option 2' },
    { value: 'opt3', label: 'Option 3' },
  ];

  it('renders with label', () => {
    render(<Select label="Choose" options={options} />);
    expect(screen.getByLabelText('Choose')).toBeInTheDocument();
  });

  it('renders all options', () => {
    render(<Select label="Choose" options={options} />);
    expect(screen.getByRole('option', { name: 'Option 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option 3' })).toBeInTheDocument();
  });

  it('renders placeholder option when provided', () => {
    render(<Select label="Choose" options={options} placeholder="Select an option" />);
    expect(screen.getByRole('option', { name: 'Select an option' })).toBeInTheDocument();
  });

  it('handles value changes', () => {
    const handleChange = vi.fn();
    render(<Select label="Choose" options={options} onChange={handleChange} />);
    const select = screen.getByLabelText('Choose');
    fireEvent.change(select, { target: { value: 'opt2' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('applies disabled state', () => {
    render(<Select label="Choose" options={options} disabled />);
    expect(screen.getByLabelText('Choose')).toBeDisabled();
  });
});





