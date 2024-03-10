import mysql from 'mysql2/promise'
import {
  DB_HOST,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_PORT
} from '../../config.js'

const config = {
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: DB_PORT
}

const connection = await mysql.createConnection(config)

export class MovieModel {
  static async getAll ({ genre }) {
    if (genre) {
      const lowerCaseGenre = genre.toLowerCase()
      // obtener id y nombre del genero de la base de datos
      const [genres] = await connection.query(
        ' SELECT id, name FROM genre WHERE LOWER(name) = ?;', [lowerCaseGenre]
      )
      // si no se encuentra el genero, retornar vacio
      if (genres.length === 0) return []
      // Obtener la primera id del genero encontrado
      const [{ id }] = genres
      // Obtener las peliculas del genero
      const [movies] = await connection.query(
        `SELECT g.id, g.name, BIN_TO_UUID(m.id) AS movie_id, m.title, m.year, m.director, m.duration, m.poster, m.rate
         FROM genre g
         INNER JOIN movie_genres mg ON g.id = mg.genre_id
         INNER JOIN movie m ON mg.movie_id = m.id
         WHERE g.id = ?;`, [id]
      )
      return movies
    }

    const [movies] = await connection.query(
      'SELECT BIN_TO_UUID(id) id, title,YEAR, director, poster, rate FROM movie;'
    )
    return movies
  }

  static async getById ({ id }) {
    const [movies] = await connection.query(
      'SELECT BIN_TO_UUID(id) id, title,YEAR, director, poster, rate FROM movie WHERE id = UUID_TO_BIN(?);',
      [id]
    )
    if (movies.length === 0) return null

    return movies[0]
  }

  static async create ({ input }) {
    const {
      genre: genreInput,
      title,
      year,
      director,
      duration,
      poster,
      rate
    } = input

    // Paso 1: Crear la película
    const [uuidResult] = await connection.query('SELECT UUID() uuid;')
    const [{ uuid }] = uuidResult

    try {
      await connection.query(
        `INSERT INTO movie (id, title, year, director, duration, poster, rate) 
        VALUES (UUID_TO_BIN("${uuid}"), ?, ?, ?, ?, ?, ?);`,
        [title, year, director, duration, poster, rate]
      )
    } catch (e) {
      throw new Error('Error creating movie')
      // enviar la traza a un servicio interno
    }

    // Paso 2: Insertar los géneros si no existen y obtener sus IDs
    for (const genreName of genreInput) {
      const [genres] = await connection.query(
        'SELECT id FROM genre WHERE name = ?;',
        [genreName]
      )
      let genreId
      if (genres.length === 0) {
      // Insertar el género si no existe
        const [insertResult] = await connection.query(
          'INSERT INTO genre (name) VALUES (?);',
          [genreName]
        )
        genreId = insertResult.insertId
      } else {
        genreId = genres[0].id
      }

      // Paso 3: Relacionar película con género
      await connection.query(
        'INSERT INTO movie_genres (movie_id, genre_id) VALUES (UUID_TO_BIN(?), ?);',
        [uuid, genreId]
      )
    }
    // Paso 4: Obtener los detalles completos de la película
    const [movies] = await connection.query(`
  SELECT 
    BIN_TO_UUID(m.id) AS movie_id, 
    m.title, 
    m.year, 
    m.director, 
    m.duration, 
    m.poster, 
    m.rate,
    GROUP_CONCAT(g.name SEPARATOR ', ') AS genres
  FROM movie m
  LEFT JOIN movie_genres mg ON m.id = mg.movie_id
  LEFT JOIN genre g ON mg.genre_id = g.id
  WHERE m.id = UUID_TO_BIN(?)
  GROUP BY m.id;
`, [uuid])

    if (movies.length === 0) return null

    // Convertir la cadena de géneros en un array
    movies[0].genres = movies[0].genres ? movies[0].genres.split(', ') : []
    return movies[0]
  }

  static async delete ({ id }) {
    await connection.query(
      'DELETE FROM movie WHERE id = UUID_TO_BIN(?)',
      [id]
    )
  }

  static async update ({ id, input }) {
    // Obtener campos de la peticion
    const listaCamposPeticion = Object.keys(input).map(campo => campo.toLowerCase())

    // Obtener columnas de la tabla
    const query = 'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = "moviesdb" AND TABLE_NAME = "movie";'
    const [columns] = await connection.query(query)
    const listaCamposTabla = columns.map(column => column.COLUMN_NAME.toLowerCase())

    // Crear una tercera lista con los campos comunes en ambas listas
    const camposComunes = listaCamposPeticion.filter(campo => listaCamposTabla.includes(campo))

    // CREAR LA CONSULTA DE ACTUALIZAR
    // Generar la parte SET de la consulta SQL dinámicamente
    const setPart = camposComunes.map(campo => `${campo} = ?`).join(', ')

    // Preparar los valores para la parte SET de la consulta basados en los campos comunes
    const values = camposComunes.map(campo => input[campo])

    // Añadir el ID al final de los valores para la cláusula WHERE
    values.push(id)

    // Crear la consulta de actualización completa
    const updateQuery = `UPDATE movie SET ${setPart} WHERE id = UUID_TO_BIN(?)`

    // Ejecutar la consulta de actualización
    try {
      const [result] = await connection.query(updateQuery, values)
      console.log('Update successful', result)
      return result
    } catch (error) {
      console.error('Error updating movie', error)
      throw error
    }
  }
}
