/** Keep search and fetch replay catalogs independent of the Windows ACL diagnosis skill. */
export const name = 'replay-acl-skill'
export const inject = ['skills']

/** Shadow the platform entry inside the replay profile without changing its sandbox. */
export function apply(ctx) {
  ctx.skills.register({
    name: 'diagnose-windows-sandbox-acl',
    description: 'Reserved for the Windows ACL diagnosis scenario.',
    content: '',
    source: 'runtime',
    invocation: { modelInvocable: false, userInvocable: false },
  })
}
