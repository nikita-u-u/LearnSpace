import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

/**
 * Read lazily, not at module load.
 *
 * Capturing this in a module-level const made the middleware dependent on
 * whether dotenv had run before this file was imported, which it had not.
 * Reading per request makes the module order-independent.
 */
function accessSecret() {
  return process.env.JWT_ACCESS_SECRET || 'local-dev-only-change-me';
}

function readBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * Rejects the request unless it carries a valid access token.
 * Attaches `req.auth = { userId, role }` and `req.user` for downstream handlers.
 */
export async function requireAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Sign in to continue', code: 'no_token' });
  }

  try {
    const payload = jwt.verify(token, accessSecret());
    const user = await User.findById(payload.sub)
      .select('_id email name role avatarStyle avatarColor');
    if (!user) {
      return res.status(401).json({ message: 'Account no longer exists', code: 'no_user' });
    }

    req.auth = { userId: user._id, role: user.role };
    req.user = user;
    next();
  } catch (error) {
    const expired = error.name === 'TokenExpiredError';
    return res.status(401).json({
      message: expired ? 'Your session expired. Sign in again.' : 'Invalid session',
      code: expired ? 'token_expired' : 'bad_token',
    });
  }
}

/** Must be used after requireAuth. */
export function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.auth) {
      return res.status(401).json({ message: 'Sign in to continue' });
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'You do not have access to this resource' });
    }
    next();
  };
}
