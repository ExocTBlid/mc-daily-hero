/** Join a site path onto the base. The base may or may not end with a slash. */
export function sitePath(path = '', base = import.meta.env.BASE_URL): string {
  const root = base.replace(/\/+$/, '')
  const suffix = path.replace(/^\/+/, '')
  return suffix ? `${root}/${suffix}` : `${root}/`
}
