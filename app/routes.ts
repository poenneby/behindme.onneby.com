import { get, post, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  health: get('/healthz'),
  home: get('/'),
  teamsHelp: get('/teams'),
  image: get('/images/*file'),
  auth: {
    signupForm: get('/signup'),
    signup: post('/signup'),
    loginForm: get('/login'),
    login: post('/login'),
    logout: post('/logout'),
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
  locations: {
    index: get('/locations'),
    show: get('/locations/:slug'),
    windows: get('/locations/:slug/teams.ps1'),
    mac: get('/locations/:slug/teams.sh'),
  },
})
