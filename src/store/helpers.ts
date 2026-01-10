/**
 * Store action helpers for reducing boilerplate in async actions
 */

type SetState<T> = (
  partial: Partial<T> | ((state: T) => Partial<T>)
) => void;
type GetState<T> = () => T;

export interface AsyncActionOptions<TArgs, TResult> {
  /** Progress message - string or function that takes args */
  progressMessage: string | ((args: TArgs) => string);
  /** The async action to execute */
  action: (args: TArgs) => Promise<TResult>;
  /** Optional callback after successful action */
  onSuccess?: (
    result: TResult,
    get: GetState<unknown>,
    set: SetState<unknown>
  ) => Promise<void> | void;
  /** Error message - string or function that takes args and error */
  errorMessage: string | ((args: TArgs, error: Error) => string);
}

/**
 * Creates a standardized async action with loading state, error handling, and optional refresh.
 *
 * @example
 * const startDistro = createAsyncAction(get, set, {
 *   progressMessage: (name) => `Starting ${name}...`,
 *   action: (name) => wslService.startDistribution(name),
 *   onSuccess: async () => { await get().fetchDistros(); },
 *   errorMessage: (name) => `Failed to start ${name}`,
 * });
 */
export function createAsyncAction<TStore, TArgs, TResult = void>(
  get: GetState<TStore>,
  set: SetState<TStore>,
  options: AsyncActionOptions<TArgs, TResult>
): (args: TArgs) => Promise<TResult | null> {
  return async (args: TArgs): Promise<TResult | null> => {
    // Set loading state
    const progress =
      typeof options.progressMessage === 'function'
        ? options.progressMessage(args)
        : options.progressMessage;

    set({ actionInProgress: progress } as unknown as Partial<TStore>);

    try {
      // Execute action
      const result = await options.action(args);

      // Call onSuccess if provided
      if (options.onSuccess) {
        await options.onSuccess(
          result,
          get as GetState<unknown>,
          set as SetState<unknown>
        );
      }

      return result;
    } catch (error) {
      // Format error message
      const message =
        typeof options.errorMessage === 'function'
          ? options.errorMessage(
              args,
              error instanceof Error ? error : new Error(String(error))
            )
          : options.errorMessage;

      set({ error: message } as unknown as Partial<TStore>);
      return null;
    } finally {
      // Clear loading state
      set({ actionInProgress: null } as unknown as Partial<TStore>);
    }
  };
}





