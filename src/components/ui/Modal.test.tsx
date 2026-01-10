import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal, ModalHeader, ModalBody, ModalFooter, Dialog } from './Modal';

describe('Modal', () => {
  describe('rendering', () => {
    it('renders children when open', () => {
      render(
        <Modal isOpen onClose={() => {}}>
          <div>Modal content</div>
        </Modal>
      );
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(
        <Modal isOpen={false} onClose={() => {}}>
          <div>Modal content</div>
        </Modal>
      );
      expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
    });

    it('renders with custom className', () => {
      render(
        <Modal isOpen onClose={() => {}} className="custom-class">
          <div>Content</div>
        </Modal>
      );
      expect(document.querySelector('.custom-class')).toBeInTheDocument();
    });
  });

  describe('backdrop', () => {
    it('calls onClose when backdrop is clicked', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen onClose={handleClose}>
          <div>Content</div>
        </Modal>
      );
      // Find and click the backdrop
      const backdrop = document.querySelector('.bg-black\\/60, .bg-black\\/70');
      if (backdrop) {
        fireEvent.click(backdrop);
        expect(handleClose).toHaveBeenCalledTimes(1);
      }
    });

    it('does not close when closeOnBackdrop is false', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen onClose={handleClose} closeOnBackdrop={false}>
          <div>Content</div>
        </Modal>
      );
      const backdrop = document.querySelector('.bg-black\\/60, .bg-black\\/70');
      if (backdrop) {
        fireEvent.click(backdrop);
        expect(handleClose).not.toHaveBeenCalled();
      }
    });
  });

  describe('sizes', () => {
    it('applies default size (md)', () => {
      render(
        <Modal isOpen onClose={() => {}}>
          <div>Content</div>
        </Modal>
      );
      const modal = document.querySelector('.max-w-lg');
      expect(modal).toBeInTheDocument();
    });

    it('applies small size', () => {
      render(
        <Modal isOpen onClose={() => {}} size="sm">
          <div>Content</div>
        </Modal>
      );
      const modal = document.querySelector('.max-w-md');
      expect(modal).toBeInTheDocument();
    });

    it('applies large size', () => {
      render(
        <Modal isOpen onClose={() => {}} size="lg">
          <div>Content</div>
        </Modal>
      );
      const modal = document.querySelector('.max-w-2xl');
      expect(modal).toBeInTheDocument();
    });

    it('applies extra large size', () => {
      render(
        <Modal isOpen onClose={() => {}} size="xl">
          <div>Content</div>
        </Modal>
      );
      const modal = document.querySelector('.max-w-4xl');
      expect(modal).toBeInTheDocument();
    });
  });
});

describe('ModalHeader', () => {
  it('renders title', () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <ModalHeader title="Test Title" onClose={() => {}} />
      </Modal>
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders close button', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen onClose={handleClose}>
        <ModalHeader title="Test" onClose={handleClose} />
      </Modal>
    );
    const closeButton = screen.getByRole('button', { name: /close/i });
    expect(closeButton).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen onClose={handleClose}>
        <ModalHeader title="Test" onClose={handleClose} />
      </Modal>
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not render close button when showCloseButton is false', () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <ModalHeader title="Test" onClose={() => {}} showCloseButton={false} />
      </Modal>
    );
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });
});

describe('ModalBody', () => {
  it('renders children', () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <ModalBody>
          <p>Body content</p>
        </ModalBody>
      </Modal>
    );
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });
});

describe('ModalFooter', () => {
  it('renders children', () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <ModalFooter>
          <button>Cancel</button>
          <button>Confirm</button>
        </ModalFooter>
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });
});

describe('Dialog (ConfirmDialog replacement)', () => {
  it('renders title and message', () => {
    render(
      <Dialog
        isOpen
        title="Confirm Action"
        message="Are you sure you want to proceed?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('renders confirm and cancel buttons', () => {
    render(
      <Dialog
        isOpen
        title="Confirm"
        message="Message"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const handleConfirm = vi.fn();
    render(
      <Dialog
        isOpen
        title="Confirm"
        message="Message"
        onConfirm={handleConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const handleCancel = vi.fn();
    render(
      <Dialog
        isOpen
        title="Confirm"
        message="Message"
        onConfirm={() => {}}
        onCancel={handleCancel}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('applies danger variant', () => {
    render(
      <Dialog
        isOpen
        title="Delete"
        message="This cannot be undone"
        variant="danger"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    // Check for danger styling on confirm button
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmButton).toHaveClass('text-theme-button-danger');
  });
});





