/**
 * Content board (Marcas, Etapa 2). A piece is one row of a brand's
 * "Planificación - X" spreadsheet, enriched with the files in the Drive
 * folder its "Pieza" cell links to. Nothing here is stored: the sheet
 * and Drive stay the source of truth and are read on demand.
 */

export type PieceFormat = 'reel' | 'carrusel' | 'imagen' | 'historia' | 'feed';

/** Where the piece stands, derived from the row and its folder. */
export type PieceStatus =
  | 'publicada' // "Pieza" links to the published Instagram post
  | 'programada' // the sheet's "Programado" box is ticked
  | 'lista' // the linked folder/file has material
  | 'sin-material' // linked folder exists but is empty
  | 'sin-acceso' // linked, but the reader can't open it (not shared with the robot)
  | 'sin-pieza'; // planned row with no link yet

export type PieceLink =
  | { kind: 'drive-folder'; id: string; url: string }
  | { kind: 'drive-file'; id: string; url: string }
  | { kind: 'instagram'; url: string }
  | { kind: 'other'; url: string };

export interface PieceMedia {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'other';
  /** Short-lived signed thumbnail from Google; null while Drive is still processing it. */
  thumbnail: string | null;
  /** Drive's own viewer/player for the file. */
  viewUrl: string;
}

/** One planned row, as read from the sheet (before Drive enrichment). */
export interface PlannedRow {
  /** Stable enough for React keys and future reviews: tab + sheet row number. */
  key: string;
  date: string | null; // YYYY-MM-DD
  time: string | null;
  title: string;
  formats: PieceFormat[];
  copy: string;
  story: string;
  notes: string;
  scheduled: boolean;
  link: PieceLink | null;
}

export interface ContentPiece extends PlannedRow {
  status: PieceStatus;
  media: PieceMedia[];
  /** 'sheet' = a planned row; 'drive' = material found in a dated Drive folder with no row for it. */
  origin: 'sheet' | 'drive';
}

export interface ContentResponse {
  brandId: string;
  sheetUrl: string;
  generatedAt: string;
  pieces: ContentPiece[];
}
