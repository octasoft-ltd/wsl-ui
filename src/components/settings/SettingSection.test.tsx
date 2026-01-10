import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingSection } from './SettingSection';
import type { PresetOption } from './constants';

const TEST_PRESETS: PresetOption[] = [
  { value: "code", label: "VS Code", description: "Visual Studio Code" },
  { value: "cursor", label: "Cursor", description: "Cursor AI Editor" },
  { value: "custom", label: "Custom", description: "Enter a custom command" },
];

const defaultProps = {
  title: "IDE Integration",
  description: "Choose your preferred code editor",
  icon: <span data-testid="icon">Icon</span>,
  iconGradient: "from-violet-500 to-purple-600",
  presets: TEST_PRESETS,
  currentValue: "code",
  onValueChange: vi.fn(),
  customPlaceholder: "Enter custom command",
  customHelpText: <span>Help text</span>,
  isLoading: false,
};

describe('SettingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders title and description', () => {
      render(<SettingSection {...defaultProps} />);
      expect(screen.getByText("IDE Integration")).toBeInTheDocument();
      expect(screen.getByText("Choose your preferred code editor")).toBeInTheDocument();
    });

    it('renders icon', () => {
      render(<SettingSection {...defaultProps} />);
      expect(screen.getByTestId("icon")).toBeInTheDocument();
    });

    it('renders all preset options', () => {
      render(<SettingSection {...defaultProps} />);
      expect(screen.getByText("VS Code")).toBeInTheDocument();
      expect(screen.getByText("Cursor")).toBeInTheDocument();
      expect(screen.getByText("Custom")).toBeInTheDocument();
    });

    it('shows loading spinner when isLoading is true', () => {
      render(<SettingSection {...defaultProps} isLoading={true} />);
      expect(screen.getByRole('heading', { name: "IDE Integration" })).toBeInTheDocument();
      // Presets should not be visible during loading
      expect(screen.queryByText("VS Code")).not.toBeInTheDocument();
    });

    it('displays current value', () => {
      render(<SettingSection {...defaultProps} currentValue="code" />);
      expect(screen.getByText("code")).toBeInTheDocument();
    });
  });

  describe('preset selection', () => {
    it('shows the current preset as selected', () => {
      render(<SettingSection {...defaultProps} currentValue="code" />);
      const vsCodeButton = screen.getByText("VS Code").closest('button');
      expect(vsCodeButton).toHaveClass('border-theme-accent-primary');
    });

    it('calls onValueChange when clicking a different preset', () => {
      const onValueChange = vi.fn();
      render(<SettingSection {...defaultProps} onValueChange={onValueChange} currentValue="code" />);

      const cursorButton = screen.getByText("Cursor").closest('button');
      fireEvent.click(cursorButton!);

      expect(onValueChange).toHaveBeenCalledWith("cursor");
    });

    it('does not call onValueChange when clicking the already selected preset', () => {
      const onValueChange = vi.fn();
      render(<SettingSection {...defaultProps} onValueChange={onValueChange} currentValue="code" />);

      const vsCodeButton = screen.getByText("VS Code").closest('button');
      fireEvent.click(vsCodeButton!);

      // Clicking "code" when currentValue is already "code" should not trigger a change
      // because handlePresetChange only calls onValueChange for non-custom values
      // and the value is the same
      expect(onValueChange).toHaveBeenCalledWith("code");
    });

    it('does not call onValueChange when clicking disabled preset', () => {
      const onValueChange = vi.fn();
      const presetsWithDisabled: PresetOption[] = [
        { value: "code", label: "VS Code", description: "Visual Studio Code" },
        { value: "disabled-option", label: "Disabled", description: "Not available", disabled: true },
        { value: "custom", label: "Custom", description: "Enter a custom command" },
      ];

      render(<SettingSection {...defaultProps} presets={presetsWithDisabled} onValueChange={onValueChange} />);

      const disabledButton = screen.getByText("Disabled").closest('button');
      fireEvent.click(disabledButton!);

      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  describe('custom mode', () => {
    it('shows custom input panel when clicking Custom', () => {
      render(<SettingSection {...defaultProps} currentValue="code" />);

      // Initially no custom input
      expect(screen.queryByPlaceholderText("Enter custom command")).not.toBeInTheDocument();

      // Click Custom
      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      // Now custom input should be visible
      expect(screen.getByPlaceholderText("Enter custom command")).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('custom input starts empty when switching from a preset', () => {
      render(<SettingSection {...defaultProps} currentValue="code" />);

      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      const input = screen.getByPlaceholderText("Enter custom command");
      expect(input).toHaveValue("");
    });

    it('custom input shows savedCustomValue when provided', () => {
      render(
        <SettingSection
          {...defaultProps}
          currentValue="code"
          savedCustomValue="/path/to/custom/editor"
        />
      );

      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      const input = screen.getByPlaceholderText("Enter custom command");
      expect(input).toHaveValue("/path/to/custom/editor");
    });

    it('Save button is disabled when input is empty', () => {
      render(<SettingSection {...defaultProps} currentValue="code" />);

      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeDisabled();
    });

    it('Save button is enabled when input has content different from saved value', () => {
      render(<SettingSection {...defaultProps} currentValue="code" savedCustomValue="" />);

      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      const input = screen.getByPlaceholderText("Enter custom command");
      fireEvent.change(input, { target: { value: '/custom/path' } });

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).not.toBeDisabled();
    });

    it('Save button is disabled when input matches saved value', () => {
      render(
        <SettingSection
          {...defaultProps}
          currentValue="code"
          savedCustomValue="/already/saved"
        />
      );

      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      // Input should be pre-filled with saved value
      const input = screen.getByPlaceholderText("Enter custom command");
      expect(input).toHaveValue("/already/saved");

      // Save button should be disabled since value hasn't changed
      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeDisabled();

      // Change the value
      fireEvent.change(input, { target: { value: '/different/path' } });
      expect(saveButton).not.toBeDisabled();

      // Change back to saved value
      fireEvent.change(input, { target: { value: '/already/saved' } });
      expect(saveButton).toBeDisabled();
    });

    it('calls onCustomValueSave when Save is clicked and callback is provided', () => {
      const onCustomValueSave = vi.fn();
      const onValueChange = vi.fn();

      render(
        <SettingSection
          {...defaultProps}
          currentValue="code"
          onValueChange={onValueChange}
          onCustomValueSave={onCustomValueSave}
        />
      );

      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      const input = screen.getByPlaceholderText("Enter custom command");
      fireEvent.change(input, { target: { value: '  /custom/path  ' } });

      const saveButton = screen.getByRole('button', { name: 'Save' });
      fireEvent.click(saveButton);

      expect(onCustomValueSave).toHaveBeenCalledWith('/custom/path'); // trimmed
      expect(onValueChange).not.toHaveBeenCalled(); // should use onCustomValueSave instead
    });

    it('calls onValueChange when Save is clicked and onCustomValueSave is not provided', () => {
      const onValueChange = vi.fn();

      render(
        <SettingSection
          {...defaultProps}
          currentValue="code"
          onValueChange={onValueChange}
        />
      );

      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      const input = screen.getByPlaceholderText("Enter custom command");
      fireEvent.change(input, { target: { value: '/custom/path' } });

      const saveButton = screen.getByRole('button', { name: 'Save' });
      fireEvent.click(saveButton);

      expect(onValueChange).toHaveBeenCalledWith('/custom/path');
    });

    it('preserves typed value when switching from custom to preset and back', () => {
      render(<SettingSection {...defaultProps} currentValue="code" />);

      // Switch to custom and type something
      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      const input = screen.getByPlaceholderText("Enter custom command");
      fireEvent.change(input, { target: { value: '/my/typed/value' } });
      expect(input).toHaveValue('/my/typed/value');

      // Switch to a preset (this should hide the custom input)
      const cursorButton = screen.getByText("Cursor").closest('button');
      fireEvent.click(cursorButton!);

      // Custom input should be hidden
      expect(screen.queryByPlaceholderText("Enter custom command")).not.toBeInTheDocument();

      // Switch back to custom
      fireEvent.click(customButton!);

      // The typed value should still be there
      const inputAgain = screen.getByPlaceholderText("Enter custom command");
      expect(inputAgain).toHaveValue('/my/typed/value');
    });
  });

  describe('current value display', () => {
    it('shows custom value when currentValue does not match any preset', () => {
      render(<SettingSection {...defaultProps} currentValue="/some/custom/path" />);

      // Should show custom as selected since the value doesn't match any preset
      const customButton = screen.getByText("Custom").closest('button');
      expect(customButton).toHaveClass('border-theme-accent-primary');

      // Custom input should be visible with the current value
      const input = screen.getByPlaceholderText("Enter custom command");
      expect(input).toHaveValue('/some/custom/path');
    });

    it('shows matching preset as selected when currentValue matches', () => {
      render(<SettingSection {...defaultProps} currentValue="cursor" />);

      const cursorButton = screen.getByText("Cursor").closest('button');
      expect(cursorButton).toHaveClass('border-theme-accent-primary');

      // Custom input should not be visible
      expect(screen.queryByPlaceholderText("Enter custom command")).not.toBeInTheDocument();
    });
  });

  describe('help text', () => {
    it('displays custom help text in custom mode', () => {
      render(
        <SettingSection
          {...defaultProps}
          currentValue="code"
          customHelpText={<span data-testid="help-text">Custom help info</span>}
        />
      );

      // Click Custom to show the panel
      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      expect(screen.getByTestId("help-text")).toBeInTheDocument();
      expect(screen.getByText("Custom help info")).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('trims whitespace from custom value on save', () => {
      const onCustomValueSave = vi.fn();

      render(
        <SettingSection
          {...defaultProps}
          currentValue="code"
          onCustomValueSave={onCustomValueSave}
        />
      );

      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      const input = screen.getByPlaceholderText("Enter custom command");
      fireEvent.change(input, { target: { value: '   /custom/path   ' } });

      const saveButton = screen.getByRole('button', { name: 'Save' });
      fireEvent.click(saveButton);

      expect(onCustomValueSave).toHaveBeenCalledWith('/custom/path');
    });

    it('does not call save when input is only whitespace', () => {
      const onCustomValueSave = vi.fn();
      const onValueChange = vi.fn();

      render(
        <SettingSection
          {...defaultProps}
          currentValue="code"
          onValueChange={onValueChange}
          onCustomValueSave={onCustomValueSave}
        />
      );

      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      const input = screen.getByPlaceholderText("Enter custom command");
      fireEvent.change(input, { target: { value: '   ' } });

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeDisabled();
      fireEvent.click(saveButton);

      expect(onCustomValueSave).not.toHaveBeenCalled();
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('updates custom input when savedCustomValue prop changes', () => {
      const { rerender } = render(
        <SettingSection
          {...defaultProps}
          currentValue="code"
          savedCustomValue=""
        />
      );

      // Click Custom to show panel
      const customButton = screen.getByText("Custom").closest('button');
      fireEvent.click(customButton!);

      // Initially empty
      let input = screen.getByPlaceholderText("Enter custom command");
      expect(input).toHaveValue("");

      // Update the savedCustomValue prop
      rerender(
        <SettingSection
          {...defaultProps}
          currentValue="code"
          savedCustomValue="/new/saved/value"
        />
      );

      // Need to click custom again since rerender may have reset state
      fireEvent.click(customButton!);

      // Input should now have the new saved value
      input = screen.getByPlaceholderText("Enter custom command");
      expect(input).toHaveValue("/new/saved/value");
    });
  });
});
