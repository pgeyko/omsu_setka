import type { MouseEvent } from 'react';
import {
  createPath,
  Link,
  useLocation,
  useNavigate,
  useResolvedPath,
  type LinkProps,
} from 'react-router-dom';
import { canAnimateNavigation, runViewTransition } from '../lib/viewTransition';

/**
 * `<Link>` that wraps same-document navigation in a View Transition.
 * Modifier clicks, new tabs and browsers without the API keep the plain
 * router behavior.
 */
export function AppLink({ to, onClick, replace, state, preventScrollReset, relative, ...rest }: LinkProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const resolved = useResolvedPath(to);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (rest.target && rest.target !== '_self') return;
    if (rest.download !== undefined) return;
    if (!canAnimateNavigation()) return;
    event.preventDefault();
    const nextReplace = replace ?? createPath(location) === createPath(resolved);
    runViewTransition(() =>
      navigate(to, { replace: nextReplace, state, preventScrollReset, relative }),
    );
  };

  return (
    <Link
      to={to}
      onClick={handleClick}
      replace={replace}
      state={state}
      preventScrollReset={preventScrollReset}
      relative={relative}
      {...rest}
    />
  );
}
