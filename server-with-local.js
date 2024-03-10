import { createApp } from './app.js'
import { MovieModel } from './models/local-file-system/movies.js'

createApp({ movieModel: MovieModel })
