/**
 * No-op mock of next/navigation for Storybook: the flag editors call useRouter()
 * (refresh after save) and may read params; none of that needs a real Next runtime
 * to render and be interacted with in isolation.
 */
const noop = () => {};

export function useRouter() {
  return {
    push: noop,
    replace: noop,
    refresh: noop,
    back: noop,
    forward: noop,
    prefetch: noop,
  };
}

export function usePathname(): string {
  return "/";
}

export function useParams<T = Record<string, string>>(): T {
  return {} as T;
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function redirect(): never {
  throw new Error("redirect() called in a story");
}

export function notFound(): never {
  throw new Error("notFound() called in a story");
}
