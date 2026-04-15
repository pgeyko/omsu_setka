import type { Transition, Variants } from 'framer-motion';

export const motionEase = [0.2, 0, 0, 1] as const;

export const overlayTransition: Transition = {
  duration: 0.2,
  ease: motionEase
};

export const drawerTransition: Transition = {
  duration: 0.34,
  ease: motionEase
};

export const modalTransition: Transition = {
  type: 'spring',
  damping: 26,
  stiffness: 280
};

export const overlayMotion: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

export const drawerMotion: Variants = {
  hidden: { y: '100%' },
  visible: { y: 0 },
  exit: { y: '100%' }
};

export const modalMotion: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 18, scale: 0.98 }
};

export const listContainerMotion: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.035
    }
  },
  exit: {
    opacity: 1,
    transition: {
      staggerChildren: 0.02,
      staggerDirection: -1
    }
  }
};

export const listItemMotion: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
      ease: motionEase
    }
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: {
      duration: 0.16,
      ease: motionEase
    }
  }
};

export const collapseMotion: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: 'auto',
    opacity: 1,
    transition: {
      height: { duration: 0.28, ease: motionEase },
      opacity: { duration: 0.18, ease: motionEase }
    }
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.22, ease: motionEase },
      opacity: { duration: 0.14, ease: motionEase }
    }
  }
};
