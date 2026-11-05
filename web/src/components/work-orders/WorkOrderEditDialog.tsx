import FormDialog from '../common/FormDialog';

import type { ComponentProps } from 'react';

export default function WorkOrderEditDialog(props: ComponentProps<typeof FormDialog>) {
  return <FormDialog {...props} className={`workshop-edit-dialog ${props.className ?? ''}`} />;
}
