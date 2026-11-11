import { cache } from "react";
import { getMovie } from "@/catalog/read/get-movie";
import type { Db } from "@/db/create-db";

/**
 * `getMovie`, remembered for one request. The page title (`generateMetadata`)
 * and the page body both need the movie, and this makes them share one read
 * (spec 0010, AC-17). React keys the memory on the arguments, and the app has
 * one `db`, so the key is in effect the movie id.
 */
export const readMovie = cache((db: Db, movieId: number) =>
  getMovie(db, movieId),
);
