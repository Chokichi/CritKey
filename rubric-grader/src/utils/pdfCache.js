/**
 * PDF Cache utility using IndexedDB for storing PDF blobs
 */

const DB_NAME = 'critkey_pdf_cache';
const DB_VERSION = 1;
const STORE_NAME = 'pdfs';
const METADATA_STORE = 'metadata';

let dbPromise = null;

const initDB = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // PDF blob store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const pdfStore = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        pdfStore.createIndex('assignmentId', 'assignmentId', { unique: false });
        pdfStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }

      // Metadata store for assignments
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        const metaStore = db.createObjectStore(METADATA_STORE, { keyPath: 'assignmentId' });
        metaStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
  });

  return dbPromise;
};

/**
 * Cache a PDF blob
 * @param {string} url - Original PDF URL
 * @param {Blob} blob - PDF blob data
 * @param {string} assignmentId - Assignment ID
 * @param {string} submissionId - Submission ID
 * @param {string} assignmentName - Assignment name (optional)
 */
export const cachePdf = async (url, blob, assignmentId, submissionId, assignmentName = null) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise((resolve, reject) => {
      const req = store.put({
        url,
        blob,
        assignmentId,
        submissionId,
        cachedAt: Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Update metadata in a separate transaction
    const metaTransaction = db.transaction([METADATA_STORE, STORE_NAME], 'readwrite');
    const metaStore = metaTransaction.objectStore(METADATA_STORE);
    const pdfStore = metaTransaction.objectStore(STORE_NAME);
    const index = pdfStore.index('assignmentId');
    
    const existing = await new Promise((resolve, reject) => {
      const req = metaStore.get(assignmentId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    
    const allPdfs = await new Promise((resolve, reject) => {
      const req = index.getAll(assignmentId);
      req.onsuccess = () => {
        const result = req.result;
        resolve(Array.isArray(result) ? result : []);
      };
      req.onerror = () => reject(req.error);
    });
    
    const uniqueSubmissions = new Set(allPdfs.map(p => p.submissionId));
    
    const metadata = {
      assignmentId,
      assignmentName: assignmentName || existing?.assignmentName || `Assignment ${assignmentId}`,
      submissionCount: uniqueSubmissions.size,
      cachedAt: Date.now(),
      ...existing,
    };
    
    await new Promise((resolve, reject) => {
      const req = metaStore.put(metadata);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('Error caching PDF:', error);
    throw error;
  }
};

/**
 * Get cached PDF blob
 * @param {string} url - PDF URL
 * @returns {Blob|null}
 */
export const getCachedPdf = async (url) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const result = await new Promise((resolve, reject) => {
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return result ? result.blob : null;
  } catch (error) {
    console.error('Error getting cached PDF:', error);
    return null;
  }
};

/**
 * Rebuild metadata from existing PDFs in cache
 * @returns {Promise<Array>}
 */
export const rebuildMetadataFromPdfs = async () => {
  try {
    const db = await initDB();
    const pdfTransaction = db.transaction([STORE_NAME], 'readonly');
    const pdfStore = pdfTransaction.objectStore(STORE_NAME);
    
    const allPdfs = await new Promise((resolve, reject) => {
      const req = pdfStore.getAll();
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
      
      if (!assignmentMap.has(pdf.assignmentId)) {
        assignmentMap.set(pdf.assignmentId, {
          assignmentId: pdf.assignmentId,
          assignmentName: pdf.assignmentName || `Assignment ${pdf.assignmentId}`,
          submissionIds: new Set(),
          cachedAt: pdf.cachedAt || Date.now(),
        });
      }
      
      const meta = assignmentMap.get(pdf.assignmentId);
      if (pdf.submissionId) {
        meta.submissionIds.add(pdf.submissionId);
      }
      // Use earliest cachedAt
      if (pdf.cachedAt && pdf.cachedAt < meta.cachedAt) {
        meta.cachedAt = pdf.cachedAt;
      }
    });

    // Save metadata
    const metaTransaction = db.transaction([METADATA_STORE], 'readwrite');
    const metaStore = metaTransaction.objectStore(METADATA_STORE);
    
    const metadataArray = Array.from(assignmentMap.values()).map(meta => ({
      assignmentId: meta.assignmentId,
      assignmentName: meta.assignmentName,
      submissionCount: meta.submissionIds.size,
      cachedAt: meta.cachedAt,
    }));

    await Promise.all(metadataArray.map(meta => 
      new Promise((resolve, reject) => {
        const req = metaStore.put(meta);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
    ));

    return metadataArray;
  } catch (error) {
    console.error('Error rebuilding metadata:', error);
    return [];
  }
};

/**
 * Get all cached assignments metadata
 * @param {boolean} rebuildIfEmpty - Rebuild metadata from PDFs if metadata store is empty
 * @returns {Array}
 */
export const getCachedAssignments = async (rebuildIfEmpty = true) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([METADATA_STORE], 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    const allMetadata = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const result = req.result;
        resolve(Array.isArray(result) ? result : []);
      };
      req.onerror = () => reject(req.error);
    });

    // If metadata is empty but we should rebuild, check if there are PDFs
    if (rebuildIfEmpty && allMetadata.length === 0) {
      const pdfTransaction = db.transaction([STORE_NAME], 'readonly');
      const pdfStore = pdfTransaction.objectStore(STORE_NAME);
      const pdfCount = await new Promise((resolve, reject) => {
        const req = pdfStore.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (pdfCount > 0) {
        // Rebuild metadata from existing PDFs
        return await rebuildMetadataFromPdfs();
      }
    }

    return allMetadata;
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
    
    // Delete PDFs
    const pdfTransaction = db.transaction([STORE_NAME], 'readwrite');
    const pdfStore = pdfTransaction.objectStore(STORE_NAME);
    const index = pdfStore.index('assignmentId');
    
    const allPdfs = await new Promise((resolve, reject) => {
      const req = index.getAll(assignmentId);
      req.onsuccess = () => {
        const result = req.result;
        resolve(Array.isArray(result) ? result : []);
      };
      req.onerror = () => reject(req.error);
    });
    
    await Promise.all(allPdfs.map(pdf => new Promise((resolve, reject) => {
      const req = pdfStore.delete(pdf.url);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    })));
    
    // Delete metadata
    const metaTransaction = db.transaction([METADATA_STORE], 'readwrite');
    const metaStore = metaTransaction.objectStore(METADATA_STORE);
    await new Promise((resolve, reject) => {
      const req = metaStore.delete(assignmentId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('Error deleting assignment cache:', error);
    throw error;
  }
};

/**
 * Clear all cached PDFs
 */
export const clearAllCache = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
    const pdfStore = transaction.objectStore(STORE_NAME);
    const metaStore = transaction.objectStore(METADATA_STORE);
    
    await Promise.all([
      new Promise((resolve, reject) => {
        const req = pdfStore.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
      new Promise((resolve, reject) => {
        const req = metaStore.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
    ]);
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
        // Blob size might not be available if it was deserialized
        // Try to get size property, or estimate from blob
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
 * Get the count of PDFs cached for a specific assignment
 * @param {string} assignmentId
 * @returns {Promise<number>}
 */
export const getPdfCountForAssignment = async (assignmentId) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const pdfStore = transaction.objectStore(STORE_NAME);
    const index = pdfStore.index('assignmentId');
    
    const allPdfs = await new Promise((resolve, reject) => {
      const req = index.getAll(assignmentId);
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

