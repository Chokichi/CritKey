/**
 * PDF Cache utility using IndexedDB for storing PDF blobs
 * Uses composite key: assignmentId_submissionId for efficient O(1) lookups
 */

const DB_NAME = 'critkey_pdf_cache';
const DB_VERSION = 3; // Incremented for composite key migration
const STORE_NAME = 'pdfs';

let dbPromise = null;

/**
 * Generate composite key from assignmentId and submissionId
 */
const getCompositeKey = (assignmentId, submissionId) => {
  return `${String(assignmentId)}_${String(submissionId)}`;
};

const initDB = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = async (event) => {
      const db = event.target.result;
      const transaction = event.target.transaction;
      const oldVersion = event.oldVersion;

      // Migrate from version 2 to 3: Change from URL key to composite key
      if (oldVersion < 3 && oldVersion > 0) {
        // Read all old data before deleting the store
        let oldPdfs = [];
        if (db.objectStoreNames.contains(STORE_NAME)) {
          const oldStore = transaction.objectStore(STORE_NAME);
          oldPdfs = await new Promise((resolve, reject) => {
            const req = oldStore.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
          });
        }

        // Delete old stores
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        if (db.objectStoreNames.contains('metadata')) {
          db.deleteObjectStore('metadata');
        }

        // Create new store with composite key
        const pdfStore = db.createObjectStore(STORE_NAME, { 
          keyPath: 'id' // Composite key: assignmentId_submissionId
        });
        pdfStore.createIndex('assignmentId', 'assignmentId', { unique: false });
        pdfStore.createIndex('submissionId', 'submissionId', { unique: false });
        pdfStore.createIndex('cachedAt', 'cachedAt', { unique: false });

        // Migrate old data to new structure
        if (oldPdfs.length > 0) {
          const newStore = transaction.objectStore(STORE_NAME);
          for (const pdf of oldPdfs) {
            if (!pdf.assignmentId || !pdf.submissionId) continue;
            
            const compositeKey = getCompositeKey(pdf.assignmentId, pdf.submissionId);
            await new Promise((resolve, reject) => {
              const req = newStore.put({
                id: compositeKey,
                assignmentId: String(pdf.assignmentId),
                submissionId: String(pdf.submissionId),
                url: pdf.url || '',
                blob: pdf.blob,
                assignmentName: pdf.assignmentName || `Assignment ${pdf.assignmentId}`,
                cachedAt: pdf.cachedAt || Date.now(),
              });
              req.onsuccess = () => resolve();
              req.onerror = () => reject(req.error);
            });
          }
        }
      } else {
        // For new databases, create the store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const pdfStore = db.createObjectStore(STORE_NAME, { 
            keyPath: 'id' 
          });
          pdfStore.createIndex('assignmentId', 'assignmentId', { unique: false });
          pdfStore.createIndex('submissionId', 'submissionId', { unique: false });
          pdfStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
      }
    };
  });

  return dbPromise;
};


/**
 * Cache a PDF blob
 * @param {string} url - Original PDF URL (kept for reference)
 * @param {Blob} blob - PDF blob data
 * @param {string} assignmentId - Assignment ID
 * @param {string} submissionId - Submission ID
 * @param {string} assignmentName - Assignment name (optional)
 */
export const cachePdf = async (url, blob, assignmentId, submissionId, assignmentName = null) => {
  try {
    if (!assignmentId || !submissionId) {
      throw new Error('assignmentId and submissionId are required');
    }

    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const compositeKey = getCompositeKey(assignmentId, submissionId);
    
    // Get existing entry to preserve assignmentName if it exists
    const existing = await new Promise((resolve, reject) => {
      const req = store.get(compositeKey);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    await new Promise((resolve, reject) => {
      const req = store.put({
        id: compositeKey,
        assignmentId: String(assignmentId),
        submissionId: String(submissionId),
        url: url || '',
        blob,
        assignmentName: assignmentName || existing?.assignmentName || `Assignment ${assignmentId}`,
        cachedAt: existing?.cachedAt || Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('Error caching PDF:', error);
    throw error;
  }
};

/**
 * Get cached PDF blob by assignment and submission ID (primary lookup method)
 * @param {string} assignmentId - Assignment ID
 * @param {string} submissionId - Submission ID
 * @returns {Blob|null}
 */
export const getCachedPdfBySubmissionId = async (assignmentId, submissionId) => {
  try {
    if (!assignmentId || !submissionId) {
      return null;
    }
    
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const compositeKey = getCompositeKey(assignmentId, submissionId);
    
    const result = await new Promise((resolve, reject) => {
      const req = store.get(compositeKey);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    
    return result ? result.blob : null;
  } catch (error) {
    console.error('Error getting cached PDF by submission ID:', error);
    return null;
  }
};

/**
 * Get cached PDF blob
 * @param {string} url - PDF URL (optional, used as fallback only)
 * @param {Object} options - { assignmentId, submissionId } for primary lookup
 * @returns {Blob|null}
 */
export const getCachedPdf = async (url = null, options = {}) => {
  try {
    // Primary lookup: by assignmentId + submissionId (O(1) lookup)
    if (options.assignmentId && options.submissionId) {
      const pdfBySubmission = await getCachedPdfBySubmissionId(options.assignmentId, options.submissionId);
      if (pdfBySubmission) {
        return pdfBySubmission;
      }
    }
    
    // Fallback: by URL (for backwards compatibility, but less efficient)
    if (!url) {
      return null;
    }
    
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    // Search by URL using index (if we had one) or iterate
    // Since we don't have a URL index, we'll use assignmentId index and filter
    // This is a fallback, so it's OK if it's slower
    const allPdfs = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const result = req.result;
        resolve(Array.isArray(result) ? result : []);
      };
      req.onerror = () => reject(req.error);
    });
    
    // Try to find by URL (normalize for matching)
    const normalizeUrl = (urlStr) => {
      try {
        let baseUrl = urlStr.split('?')[0].split('#')[0];
        baseUrl = baseUrl.replace(/\/+$/, '');
        try {
          return decodeURIComponent(baseUrl);
        } catch {
          return baseUrl;
        }
      } catch {
        return urlStr.split('?')[0].split('#')[0].replace(/\/+$/, '');
      }
    };
    
    const extractFileId = (urlStr) => {
      const match = urlStr.match(/\/files\/(\d+)/);
      return match ? match[1] : null;
    };
    
    const normalizedSearchUrl = normalizeUrl(url);
    const searchFileId = extractFileId(url);
    
    const matching = allPdfs.find(p => {
      if (!p.url) return false;
      const normalizedCachedUrl = normalizeUrl(p.url);
      const cachedFileId = extractFileId(p.url);
      
      if (normalizedCachedUrl === normalizedSearchUrl) return true;
      if (searchFileId && cachedFileId && searchFileId === cachedFileId) return true;
      return normalizedCachedUrl.includes(normalizedSearchUrl) ||
             normalizedSearchUrl.includes(normalizedCachedUrl);
    });
    
    return matching ? matching.blob : null;
  } catch (error) {
    console.error('Error getting cached PDF:', error);
    return null;
  }
};

/**
 * Get all cached assignments metadata (computed on-demand)
 * @returns {Promise<Array>}
 */
export const getCachedAssignments = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const allPdfs = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const result = req.result;
        resolve(Array.isArray(result) ? result : []);
      };
      req.onerror = () => reject(req.error);
    });

    // Group PDFs by assignmentId
    const assignmentMap = new Map();
    allPdfs.forEach(pdf => {
      if (!pdf.assignmentId) return;
      
      const assignmentId = String(pdf.assignmentId);
      
      if (!assignmentMap.has(assignmentId)) {
        assignmentMap.set(assignmentId, {
          assignmentId: assignmentId,
          assignmentName: pdf.assignmentName || `Assignment ${assignmentId}`,
          submissionIds: new Set(),
          cachedAt: pdf.cachedAt || Date.now(),
        });
      }
      
      const meta = assignmentMap.get(assignmentId);
      if (pdf.submissionId) {
        meta.submissionIds.add(String(pdf.submissionId));
      }
      // Use earliest cachedAt
      if (pdf.cachedAt && pdf.cachedAt < meta.cachedAt) {
        meta.cachedAt = pdf.cachedAt;
      }
      // Preserve assignment name if we find a better one
      if (pdf.assignmentName && pdf.assignmentName !== `Assignment ${assignmentId}`) {
        meta.assignmentName = pdf.assignmentName;
      }
    });

    // Convert to array format
    return Array.from(assignmentMap.values()).map(meta => ({
      assignmentId: meta.assignmentId,
      assignmentName: meta.assignmentName,
      submissionCount: meta.submissionIds.size,
      cachedAt: meta.cachedAt,
    }));
  } catch (error) {
    console.error('Error getting cached assignments:', error);
    return [];
  }
};

/**
 * Delete cached PDFs for an assignment
 * @param {string} assignmentId
 */
export const deleteAssignmentCache = async (assignmentId) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('assignmentId');
    
    const allPdfs = await new Promise((resolve, reject) => {
      const req = index.getAll(String(assignmentId));
      req.onsuccess = () => {
        const result = req.result;
        resolve(Array.isArray(result) ? result : []);
      };
      req.onerror = () => reject(req.error);
    });
    
    await Promise.all(allPdfs.map(pdf => new Promise((resolve, reject) => {
      const req = store.delete(pdf.id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    })));
  } catch (error) {
    console.error('Error deleting assignment cache:', error);
    throw error;
  }
};

/**
 * Clear all cached PDFs by deleting and recreating the database
 * This ensures a completely fresh start and fixes any migration issues
 */
export const clearAllCache = async () => {
  try {
    // Close any existing database connection
    if (dbPromise) {
      const db = await dbPromise;
      db.close();
    }
    
    // Delete the entire database
    await new Promise((resolve, reject) => {
      const deleteReq = indexedDB.deleteDatabase(DB_NAME);
      deleteReq.onsuccess = () => resolve();
      deleteReq.onerror = () => reject(deleteReq.error);
      deleteReq.onblocked = () => {
        // Database is in use, wait a bit and try again
        setTimeout(() => {
          const retryReq = indexedDB.deleteDatabase(DB_NAME);
          retryReq.onsuccess = () => resolve();
          retryReq.onerror = () => reject(retryReq.error);
        }, 100);
      };
    });
    
    // Reset the dbPromise so a fresh database is created on next access
    dbPromise = null;
    
    // Initialize a fresh database (this will create it with the latest structure)
    await initDB();
  } catch (error) {
    console.error('Error clearing cache:', error);
    throw error;
  }
};

/**
 * Get cache size estimate
 * @returns {Promise<{count: number, size: number}>}
 */
export const getCacheSize = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const allPdfs = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const result = req.result;
        resolve(Array.isArray(result) ? result : []);
      };
      req.onerror = () => reject(req.error);
    });

    let totalSize = 0;
    allPdfs.forEach(pdf => {
      if (pdf && pdf.blob) {
        if (typeof pdf.blob.size === 'number') {
          totalSize += pdf.blob.size;
        } else if (pdf.blob instanceof Blob) {
          totalSize += pdf.blob.size || 0;
        }
      }
    });

    return {
      count: allPdfs.length,
      size: totalSize,
    };
  } catch (error) {
    console.error('Error getting cache size:', error);
    return { count: 0, size: 0 };
  }
};

/**
 * Clean up old cached PDFs (older than specified days)
 * @param {number} daysOld - Delete PDFs cached more than this many days ago (default: 7)
 * @returns {Promise<number>} Number of PDFs deleted
 */
export const cleanupOldCache = async (daysOld = 7) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Get all cached PDFs
    const allPdfs = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    // Calculate cutoff time
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

    // Delete old PDFs
    let deletedCount = 0;
    for (const pdf of allPdfs) {
      if (pdf.cachedAt && pdf.cachedAt < cutoffTime) {
        await new Promise((resolve, reject) => {
          const req = store.delete(pdf.id);
          req.onsuccess = () => {
            deletedCount++;
            resolve();
          };
          req.onerror = () => reject(req.error);
        });
      }
    }

    console.log(`[cleanupOldCache] Deleted ${deletedCount} PDFs older than ${daysOld} days`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up old cache:', error);
    return 0;
  }
};

/**
 * Delete cache for a specific assignment if fully graded
 * @param {string} assignmentId - Assignment ID
 * @param {Object} options - Options for checking if assignment is complete
 * @param {boolean} options.allGraded - Whether all submissions are graded
 * @param {boolean} options.allPushed - Whether all staged grades have been pushed
 * @returns {Promise<boolean>} True if cache was deleted
 */
export const cleanupCompletedAssignment = async (assignmentId, { allGraded, allPushed }) => {
  // Only delete if both conditions are met
  if (!allGraded || !allPushed) {
    return false;
  }

  try {
    await deleteAssignmentCache(assignmentId);
    console.log(`[cleanupCompletedAssignment] Deleted cache for completed assignment ${assignmentId}`);
    return true;
  } catch (error) {
    console.error(`Error cleaning up assignment ${assignmentId}:`, error);
    return false;
  }
};

/**
 * Get the count of PDFs cached for a specific assignment
 * @param {string} assignmentId
 * @returns {Promise<number>}
 */
export const getPdfCountForAssignment = async (assignmentId) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('assignmentId');
    
    const allPdfs = await new Promise((resolve, reject) => {
      const req = index.getAll(String(assignmentId));
      req.onsuccess = () => {
        const result = req.result;
        resolve(Array.isArray(result) ? result : []);
      };
      req.onerror = () => reject(req.error);
    });
    
    return allPdfs.length;
  } catch (error) {
    console.error('Error getting PDF count for assignment:', error);
    return 0;
  }
};

