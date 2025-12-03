/**
 * MongoDB Database Connection Configuration
 * 
 * Handles connection to local MongoDB for storing evaluation history
 */

import mongoose from 'mongoose';
import type { Logger } from '../types';

interface DatabaseOptions {
  logger?: Logger;
  uri?: string;
}

const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/trustwise';

/**
 * Connect to MongoDB
 */
export const connectDatabase = async (options: DatabaseOptions = {}): Promise<typeof mongoose> => {
  const logger = options.logger || console;
  const uri = options.uri || process.env['MONGODB_URI'] || DEFAULT_MONGO_URI;

  try {
    logger.info('[Database] Connecting to MongoDB...', { uri: uri.replace(/\/\/.*@/, '//***@') });

    const connection = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info('[Database] MongoDB connected successfully', {
      host: connection.connection.host,
      database: connection.connection.name,
    });

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('[Database] MongoDB connection error', { error: err.message });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('[Database] MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('[Database] MongoDB reconnected');
    });

    return connection;
  } catch (error) {
    const err = error as Error;
    logger.error('[Database] Failed to connect to MongoDB', { error: err.message });
    throw error;
  }
};

/**
 * Disconnect from MongoDB
 */
export const disconnectDatabase = async (logger?: Logger): Promise<void> => {
  const log = logger || console;
  
  try {
    await mongoose.disconnect();
    log.info('[Database] MongoDB disconnected');
  } catch (error) {
    const err = error as Error;
    log.error('[Database] Error disconnecting from MongoDB', { error: err.message });
    throw error;
  }
};

/**
 * Check if MongoDB is connected
 */
export const isDatabaseConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};

/**
 * Get database connection status
 */
export const getDatabaseStatus = (): {
  connected: boolean;
  readyState: number;
  host?: string;
  database?: string;
} => {
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    database: mongoose.connection.name,
  };
};

export default {
  connectDatabase,
  disconnectDatabase,
  isDatabaseConnected,
  getDatabaseStatus,
};

