/// <reference types="electron-vite/node" />
// electron-vite builds the worker as its own chunk and returns its path (dev + packaged).
import workerPath from './cs2-demo-parse-worker?modulePath'

export default workerPath
