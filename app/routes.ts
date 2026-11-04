import { get, post, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  health: get('/healthz'),
  home: get('/'),
  teamsHelp: get('/teams'),
  animatedHelp: get('/animated'),
  image: get('/images/*file'),
  auth: {
    signupForm: get('/signup'),
    signup: post('/signup'),
    loginForm: get('/login'),
    login: post('/login'),
    logout: post('/logout'),
    checkEmail: get('/check-email'),
    // Opening the link shows a button; only pressing it uses the token, so
    // mail scanners that follow every link can't use it up.
    verifyForm: get('/verify/:token'),
    verify: post('/verify/:token'),
    resendVerification: post('/verify'),
    forgotForm: get('/forgot'),
    forgot: post('/forgot'),
    resetForm: get('/reset/:token'),
    reset: post('/reset/:token'),
  },
  backgrounds: {
    uploadForm: get('/upload'),
    upload: post('/upload'),
    mine: get('/mine'),
    show: get('/b/:id'),
    download: get('/b/:id/download'),
    rate: post('/b/:id/rate'),
    destroy: post('/b/:id/delete'),
    windows: get('/b/:id/teams.ps1'),
    mac: get('/b/:id/teams.sh'),
  },
  admin: {
    users: get('/admin/users'),
    role: post('/admin/users/:id/role'),
    disable: post('/admin/users/:id/disable'),
    enable: post('/admin/users/:id/enable'),
    activate: post('/admin/users/:id/activate'),
    sendReset: post('/admin/users/:id/reset'),
    deleteForm: get('/admin/users/:id/delete'),
    destroy: post('/admin/users/:id/delete'),
  },
  categories: {
    index: get('/categories'),
    show: get('/categories/:slug'),
    windows: get('/categories/:slug/teams.ps1'),
    mac: get('/categories/:slug/teams.sh'),
    // Addresses from when categories were offices, redirected so saved
    // links and install commands keep working.
    oldIndex: get('/locations'),
    oldShow: get('/locations/:slug'),
    oldWindows: get('/locations/:slug/teams.ps1'),
    oldMac: get('/locations/:slug/teams.sh'),
  },
})
