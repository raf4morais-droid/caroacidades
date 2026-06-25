export interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
export interface PaginatedResponse<T> {
    data: T[];
    pagination: Pagination;
}
export interface BBox {
    minx: number;
    miny: number;
    maxx: number;
    maxy: number;
}
export interface GeoJSONGeometry {
    type: string;
    coordinates: unknown;
}
export interface ApiError {
    statusCode: number;
    error: string;
    message: string;
}
export type ExportFormat = 'xls' | 'pdf' | 'csv' | 'xml';
