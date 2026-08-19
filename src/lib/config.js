import Conf from 'conf'

/**
 * A profile name becomes a lock file name and a keychain entry, so it must
 * stay one safe path segment.
 */
export const PROFILE_NAME_RE = /^[A-Za-z0-9._-]+$/

/**
 * A pasted ngrok domain often carries the scheme and a trailing slash. The
 * redirect URI needs the bare name.
 * @param {string} value
 * @returns {string}
 */
export function normalizeDomain(value) {
  return value
    .trim()
    .replace(/^https:\/\//, '')
    .replace(/\/$/, '')
}

const schema = {
  activeProfile: { type: 'string', default: 'default' },
  profiles: {
    type: 'object',
    default: {},
  },
}

/** @type {Conf | undefined} */
let _conf

export function getConf() {
  // EXACTCLI_CONFIG_DIR overrides the config directory (used to isolate the
  // store in tests/CI/sandboxes so a run never touches the user's real
  // profiles); undefined falls back to conf's default OS config path.
  _conf ??= new Conf({
    projectName: 'exactcli',
    schema,
    cwd: process.env.EXACTCLI_CONFIG_DIR,
  })
  return _conf
}

/**
 * @param {string} [profileFlag]
 * @returns {{ activeProfile: string, [key: string]: unknown }}
 */
export function loadConfig(profileFlag) {
  const conf = getConf()
  const activeProfile = profileFlag ?? conf.get('activeProfile')
  const profileData = conf.get(`profiles.${activeProfile}`) ?? {}
  return { activeProfile, ...profileData }
}

export function getActiveProfile() {
  return getConf().get('activeProfile')
}

/** @param {string} name */
export function setActiveProfile(name) {
  getConf().set('activeProfile', name)
}

/**
 * @param {string} profile
 * @param {string} key
 */
export function getProfileConfig(profile, key) {
  return getConf().get(`profiles.${profile}.${key}`)
}

/**
 * @param {string} profile
 * @param {string} key
 * @param {unknown} value
 */
export function setProfileConfig(profile, key, value) {
  getConf().set(`profiles.${profile}.${key}`, value)
}

/** @param {string} profile */
export function getProfileData(profile) {
  return getConf().get(`profiles.${profile}`) ?? {}
}

export function getAllProfiles() {
  return getConf().get('profiles')
}

/**
 * @param {string} profile
 * @param {string} key
 */
export function deleteProfileConfig(profile, key) {
  getConf().delete(`profiles.${profile}.${key}`)
}
