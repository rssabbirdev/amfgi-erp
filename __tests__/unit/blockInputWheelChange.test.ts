import { withBlockInputWheelChange } from '@/lib/utils/blockInputWheelChange';

describe('blockInputWheelChange', () => {
  it('merges arrow-key blocking into input props', () => {
    const props = withBlockInputWheelChange({});
    const preventDefault = jest.fn();
    props.onKeyDown?.({
      key: 'ArrowDown',
      preventDefault,
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
    expect(preventDefault).toHaveBeenCalled();
  });
});
