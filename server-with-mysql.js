import { createApp } from './app.js'
import { MovieModel } from './models/mysql/movies.js'

createApp({ movieModel: MovieModel })
