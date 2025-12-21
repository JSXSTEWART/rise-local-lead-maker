import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { env } from '../config/env.js';
import type { Lead } from '../types/index.js';

let pool: Pool | null = null;
let isReconnecting = false;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST || 'localhost',
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      // Automatic reconnection
      maxIdle: 10,
      idleTimeout: 60000, // 60 seconds
      connectTimeout: 10000, // 10 seconds
    });

    // Handle connection errors
    pool.on('connection', (connection) => {
      console.log('[DB] New connection established');
      connection.on('error', (err) => {
        console.error('[DB] Connection error:', err.message);
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
          handleDisconnect();
        }
      });
    });
  }
  return pool;
}

async function handleDisconnect() {
  if (isReconnecting) return;

  isReconnecting = true;
  console.error('[DB] Connection lost. Attempting to reconnect...');

  try {
    if (pool) {
      await pool.end();
      pool = null;
    }

    // Recreate pool
    getPool();

    // Test connection
    const testPool = getPool();
    await testPool.query('SELECT 1');

    console.log('[DB] Reconnection successful');
  } catch (err) {
    console.error('[DB] Reconnection failed:', err);
    setTimeout(handleDisconnect, 5000); // Retry after 5 seconds
  } finally {
    isReconnecting = false;
  }
}

// Test connection on startup
export async function testConnection(): Promise<boolean> {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    console.log('[DB] Database connection verified');
    return true;
  } catch (err) {
    console.error('[DB] Connection test failed:', err);
    return false;
  }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] Connection pool closed');
  }
}

// Supabase-compatible query builder facade
interface QueryResult<T> {
  data: T | null;
  error: Error | null;
  count?: number;
}

class QueryBuilder {
  private table: string;
  private selectFields: string = '*';
  private whereConditions: string[] = [];
  private whereParams: any[] = [];
  private orderByClause: string = '';
  private limitClause: string = '';
  private offsetClause: string = '';
  private countTotal: boolean = false;
  private headOnly: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(fields: string = '*', options?: { count?: 'exact'; head?: boolean }): this {
    this.selectFields = fields === '*' ? '*' : fields;
    if (options?.count === 'exact') this.countTotal = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  eq(column: string, value: any): this {
    this.whereConditions.push(`${this.toSnakeCase(column)} = ?`);
    this.whereParams.push(value);
    return this;
  }

  in(column: string, values: any[]): this {
    if (values.length > 0) {
      this.whereConditions.push(`${this.toSnakeCase(column)} IN (?)`);
      this.whereParams.push(values);
    }
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.whereConditions.push(`${this.toSnakeCase(column)} LIKE ?`);
    this.whereParams.push(pattern.replace(/%/g, '%'));
    return this;
  }

  gte(column: string, value: any): this {
    this.whereConditions.push(`${this.toSnakeCase(column)} >= ?`);
    this.whereParams.push(value);
    return this;
  }

  or(conditions: string): this {
    // Parse Supabase-style OR: "field.ilike.%value%,field2.ilike.%value%"
    const parts = conditions.split(',');
    const orClauses: string[] = [];
    for (const part of parts) {
      const [field, op, ...valueParts] = part.split('.');
      const value = valueParts.join('.');
      if (op === 'ilike') {
        orClauses.push(`${this.toSnakeCase(field)} LIKE ?`);
        this.whereParams.push(value);
      }
    }
    if (orClauses.length > 0) {
      this.whereConditions.push(`(${orClauses.join(' OR ')})`);
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    const dir = options?.ascending === false ? 'DESC' : 'ASC';
    this.orderByClause = `ORDER BY ${this.toSnakeCase(column)} ${dir}`;
    return this;
  }

  limit(count: number): this {
    this.limitClause = `LIMIT ${count}`;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetClause = `LIMIT ${to - from + 1} OFFSET ${from}`;
    return this;
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private rowToLead(row: any): Lead {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      company: row.company,
      title: row.title,
      phone: row.phone,
      website: row.website,
      linkedinUrl: row.linkedin_url,
      location: row.location,
      industry: row.industry,
      companySize: row.company_size,
      enrichedAt: row.enriched_at,
      source: row.source,
      status: row.status || 'new',
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {},
    };
  }

  async then<T>(resolve: (result: QueryResult<T[]>) => void): Promise<void> {
    try {
      const result = await this.execute<T[]>();
      resolve(result);
    } catch (error) {
      resolve({ data: null, error: error as Error });
    }
  }

  async execute<T>(): Promise<QueryResult<T>> {
    const pool = getPool();
    let sql = `SELECT ${this.selectFields} FROM ${this.table}`;

    if (this.whereConditions.length > 0) {
      sql += ` WHERE ${this.whereConditions.join(' AND ')}`;
    }

    if (this.orderByClause) sql += ` ${this.orderByClause}`;
    if (this.offsetClause) sql += ` ${this.offsetClause}`;
    else if (this.limitClause) sql += ` ${this.limitClause}`;

    try {
      if (this.headOnly && this.countTotal) {
        const countSql = `SELECT COUNT(*) as count FROM ${this.table}` +
          (this.whereConditions.length > 0 ? ` WHERE ${this.whereConditions.join(' AND ')}` : '');
        const [rows] = await pool.execute<RowDataPacket[]>(countSql, this.whereParams);
        return { data: null, error: null, count: rows[0].count };
      }

      const [rows] = await pool.execute<RowDataPacket[]>(sql, this.whereParams);
      const leads = (rows as any[]).map((row) => this.rowToLead(row));

      let count: number | undefined;
      if (this.countTotal) {
        const countSql = `SELECT COUNT(*) as count FROM ${this.table}` +
          (this.whereConditions.length > 0 ? ` WHERE ${this.whereConditions.join(' AND ')}` : '');
        const [countRows] = await pool.execute<RowDataPacket[]>(countSql, this.whereParams);
        count = countRows[0].count;
      }

      return { data: leads as unknown as T, error: null, count };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  async single(): Promise<QueryResult<Lead>> {
    this.limitClause = 'LIMIT 1';
    const result = await this.execute<Lead[]>();
    if (result.error) return { data: null, error: result.error };
    if (!result.data || (result.data as Lead[]).length === 0) {
      return { data: null, error: new Error('No rows found') };
    }
    return { data: (result.data as Lead[])[0], error: null };
  }

  insert(data: any | any[]): InsertBuilder {
    return new InsertBuilder(this.table, data);
  }

  update(data: any): UpdateBuilder {
    return new UpdateBuilder(this.table, data, this.whereConditions, this.whereParams);
  }

  delete(): DeleteBuilder {
    return new DeleteBuilder(this.table, this.whereConditions, this.whereParams);
  }

  upsert(data: any[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): UpsertBuilder {
    return new UpsertBuilder(this.table, data, options);
  }
}

class InsertBuilder {
  private table: string;
  private data: any[];
  private returnData: boolean = false;

  constructor(table: string, data: any | any[]) {
    this.table = table;
    this.data = Array.isArray(data) ? data : [data];
  }

  select(): this {
    this.returnData = true;
    return this;
  }

  async single(): Promise<QueryResult<Lead>> {
    const result = await this.execute();
    if (result.error) return { data: null, error: result.error };
    return { data: result.data?.[0] || null, error: null };
  }

  async execute(): Promise<QueryResult<Lead[]>> {
    const pool = getPool();
    const results: Lead[] = [];

    for (const item of this.data) {
      const snakeData = this.toSnakeCase(item);
      const columns = Object.keys(snakeData);
      const values = Object.values(snakeData);
      const placeholders = columns.map(() => '?').join(', ');

      const sql = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${placeholders})`;

      try {
        const [result] = await pool.execute<ResultSetHeader>(sql, values);
        if (this.returnData) {
          const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM ${this.table} WHERE id = ?`,
            [result.insertId]
          );
          if (rows[0]) results.push(this.rowToLead(rows[0]));
        }
      } catch (error) {
        return { data: null, error: error as Error };
      }
    }

    return { data: results, error: null };
  }

  private toSnakeCase(obj: any): any {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      result[snakeKey] = typeof value === 'object' && value !== null && !(value instanceof Date)
        ? JSON.stringify(value)
        : value;
    }
    return result;
  }

  private rowToLead(row: any): Lead {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      company: row.company,
      title: row.title,
      phone: row.phone,
      website: row.website,
      linkedinUrl: row.linkedin_url,
      location: row.location,
      industry: row.industry,
      companySize: row.company_size,
      enrichedAt: row.enriched_at,
      source: row.source,
      status: row.status || 'new',
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {},
    };
  }

  async then<T>(resolve: (result: QueryResult<Lead[]>) => void): Promise<void> {
    const result = await this.execute();
    resolve(result);
  }
}

class UpdateBuilder {
  private table: string;
  private data: any;
  private whereConditions: string[];
  private whereParams: any[];
  private returnData: boolean = false;

  constructor(table: string, data: any, whereConditions: string[], whereParams: any[]) {
    this.table = table;
    this.data = data;
    this.whereConditions = whereConditions;
    this.whereParams = whereParams;
  }

  eq(column: string, value: any): this {
    const snakeCol = column.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    this.whereConditions.push(`${snakeCol} = ?`);
    this.whereParams.push(value);
    return this;
  }

  select(): this {
    this.returnData = true;
    return this;
  }

  async single(): Promise<QueryResult<Lead>> {
    const result = await this.execute();
    if (result.error) return { data: null, error: result.error };
    return { data: result.data?.[0] || null, error: null };
  }

  async execute(): Promise<QueryResult<Lead[]>> {
    const pool = getPool();
    const snakeData = this.toSnakeCase(this.data);
    const setClauses = Object.keys(snakeData).map((col) => `${col} = ?`);
    const setValues = Object.values(snakeData);

    let sql = `UPDATE ${this.table} SET ${setClauses.join(', ')}`;
    if (this.whereConditions.length > 0) {
      sql += ` WHERE ${this.whereConditions.join(' AND ')}`;
    }

    try {
      await pool.execute(sql, [...setValues, ...this.whereParams]);

      if (this.returnData && this.whereConditions.length > 0) {
        const selectSql = `SELECT * FROM ${this.table} WHERE ${this.whereConditions.join(' AND ')}`;
        const [rows] = await pool.execute<RowDataPacket[]>(selectSql, this.whereParams);
        return { data: (rows as any[]).map((r) => this.rowToLead(r)), error: null };
      }

      return { data: [], error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  private toSnakeCase(obj: any): any {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      result[snakeKey] = typeof value === 'object' && value !== null && !(value instanceof Date)
        ? JSON.stringify(value)
        : value;
    }
    return result;
  }

  private rowToLead(row: any): Lead {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      company: row.company,
      title: row.title,
      phone: row.phone,
      website: row.website,
      linkedinUrl: row.linkedin_url,
      location: row.location,
      industry: row.industry,
      companySize: row.company_size,
      enrichedAt: row.enriched_at,
      source: row.source,
      status: row.status || 'new',
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {},
    };
  }

  async then<T>(resolve: (result: QueryResult<Lead[]>) => void): Promise<void> {
    const result = await this.execute();
    resolve(result);
  }
}

class DeleteBuilder {
  private table: string;
  private whereConditions: string[];
  private whereParams: any[];

  constructor(table: string, whereConditions: string[], whereParams: any[]) {
    this.table = table;
    this.whereConditions = whereConditions;
    this.whereParams = whereParams;
  }

  eq(column: string, value: any): this {
    const snakeCol = column.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    this.whereConditions.push(`${snakeCol} = ?`);
    this.whereParams.push(value);
    return this;
  }

  async execute(): Promise<QueryResult<null>> {
    const pool = getPool();
    let sql = `DELETE FROM ${this.table}`;
    if (this.whereConditions.length > 0) {
      sql += ` WHERE ${this.whereConditions.join(' AND ')}`;
    }
    try {
      await pool.execute(sql, this.whereParams);
      return { data: null, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  async then<T>(resolve: (result: QueryResult<null>) => void): Promise<void> {
    const result = await this.execute();
    resolve(result);
  }
}

class UpsertBuilder {
  private table: string;
  private data: any[];
  private options?: { onConflict?: string; ignoreDuplicates?: boolean };
  private returnData: boolean = false;

  constructor(table: string, data: any[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.table = table;
    this.data = data;
    this.options = options;
  }

  select(): this {
    this.returnData = true;
    return this;
  }

  async execute(): Promise<QueryResult<Lead[]>> {
    const pool = getPool();
    const results: Lead[] = [];

    for (const item of this.data) {
      const snakeData = this.toSnakeCase(item);
      const columns = Object.keys(snakeData);
      const values = Object.values(snakeData);
      const placeholders = columns.map(() => '?').join(', ');

      let sql: string;
      if (this.options?.ignoreDuplicates) {
        sql = `INSERT IGNORE INTO ${this.table} (${columns.join(', ')}) VALUES (${placeholders})`;
      } else {
        const updateClauses = columns.map((col) => `${col} = VALUES(${col})`).join(', ');
        sql = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClauses}`;
      }

      try {
        const [result] = await pool.execute<ResultSetHeader>(sql, values);
        if (this.returnData && result.insertId) {
          const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM ${this.table} WHERE id = ?`,
            [result.insertId]
          );
          if (rows[0]) results.push(this.rowToLead(rows[0]));
        }
      } catch (error) {
        console.error('Upsert error:', error);
      }
    }

    return { data: results, error: null };
  }

  private toSnakeCase(obj: any): any {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      result[snakeKey] = typeof value === 'object' && value !== null && !(value instanceof Date)
        ? JSON.stringify(value)
        : value;
    }
    return result;
  }

  private rowToLead(row: any): Lead {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      company: row.company,
      title: row.title,
      phone: row.phone,
      website: row.website,
      linkedinUrl: row.linkedin_url,
      location: row.location,
      industry: row.industry,
      companySize: row.company_size,
      enrichedAt: row.enriched_at,
      source: row.source,
      status: row.status || 'new',
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {},
    };
  }

  async then<T>(resolve: (result: QueryResult<Lead[]>) => void): Promise<void> {
    const result = await this.execute();
    resolve(result);
  }
}

// Supabase-compatible client facade
class SupabaseClient {
  from(table: string): QueryBuilder {
    return new QueryBuilder(table);
  }
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = new SupabaseClient();
  }
  return supabaseClient;
}

// Legacy exports for compatibility
export const supabase = getSupabase();

export async function getLeads(limit = 100, offset = 0): Promise<Lead[]> {
  const result = await getSupabase()
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
    .execute<Lead[]>();

  return result.data || [];
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const result = await getSupabase()
    .from('leads')
    .select('*')
    .eq('id', id)
    .single();

  return result.data;
}

export async function createLead(lead: Omit<Lead, 'id'>): Promise<Lead> {
  const pool = getPool();
  const snakeData: any = {};
  for (const [key, value] of Object.entries(lead)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    snakeData[snakeKey] = typeof value === 'object' && value !== null && !(value instanceof Date)
      ? JSON.stringify(value)
      : value;
  }

  const columns = Object.keys(snakeData);
  const values = Object.values(snakeData);
  const placeholders = columns.map(() => '?').join(', ');

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO leads (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM leads WHERE id = ?',
    [result.insertId]
  );

  return rowToLead(rows[0]);
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
  const pool = getPool();
  const snakeData: any = {};
  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    snakeData[snakeKey] = typeof value === 'object' && value !== null && !(value instanceof Date)
      ? JSON.stringify(value)
      : value;
  }

  const setClauses = Object.keys(snakeData).map((col) => `${col} = ?`);
  const setValues = Object.values(snakeData);

  await pool.execute(
    `UPDATE leads SET ${setClauses.join(', ')} WHERE id = ?`,
    [...setValues, id]
  );

  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM leads WHERE id = ?',
    [id]
  );

  return rowToLead(rows[0]);
}

export async function upsertLeads(leads: Lead[]): Promise<Lead[]> {
  const result = await getSupabase()
    .from('leads')
    .upsert(leads, { onConflict: 'email' });

  const upsertResult = await (result as unknown as UpsertBuilder).select().execute();
  return upsertResult.data || [];
}

export async function getLeadsByStatus(status: Lead['status']): Promise<Lead[]> {
  const result = await getSupabase()
    .from('leads')
    .select('*')
    .eq('status', status)
    .execute<Lead[]>();

  return result.data || [];
}

function rowToLead(row: any): Lead {
  return {
    id: row.id?.toString(),
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company,
    title: row.title,
    phone: row.phone,
    website: row.website,
    linkedinUrl: row.linkedin_url,
    location: row.location,
    industry: row.industry,
    companySize: row.company_size,
    enrichedAt: row.enriched_at,
    source: row.source,
    status: row.status || 'new',
    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {},
  };
}

// SQL for creating the leads table in MySQL
export const LEADS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  company VARCHAR(255),
  title VARCHAR(255),
  phone VARCHAR(100),
  website VARCHAR(500),
  linkedin_url VARCHAR(500),
  location VARCHAR(255),
  industry VARCHAR(255),
  company_size VARCHAR(100),
  enriched_at DATETIME,
  source VARCHAR(100),
  status ENUM('new', 'enriching', 'enriched', 'failed') DEFAULT 'new',
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leads_email (email),
  INDEX idx_leads_status (status),
  INDEX idx_leads_company (company)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
