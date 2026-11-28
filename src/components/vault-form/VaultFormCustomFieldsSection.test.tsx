/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VaultCustomField } from '../../types';
import { VaultFormCustomFieldsSection } from './VaultFormCustomFieldsSection';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VaultFormCustomFieldsSection', () => {
  it('adds, updates, changes type, and removes custom fields', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <VaultFormCustomFieldsSection fields={[]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByTestId('vault-item-add-custom-field-button'));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ label: '', value: '', type: 'text' }),
    ]);

    const initialFields: VaultCustomField[] = [
      { id: 'cf-1', label: 'Org', value: 'Acme', type: 'text' },
    ];
    rerender(<VaultFormCustomFieldsSection fields={initialFields} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('vault-custom-field-label-0'), {
      target: { value: 'Customer ID' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'cf-1', label: 'Customer ID', value: 'Acme', type: 'text' },
    ]);

    fireEvent.change(screen.getByTestId('vault-custom-field-value-0'), {
      target: { value: 'CUST-99' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'cf-1', label: 'Org', value: 'CUST-99', type: 'text' },
    ]);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'hidden' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'cf-1', label: 'Org', value: 'Acme', type: 'hidden' },
    ]);

    fireEvent.click(screen.getByTitle('Kaldır'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
