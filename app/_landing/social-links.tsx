import s from '../landing.module.css'
import { SocialLinks as SharedSocialLinks } from '../../components/social-links'

export function SocialLinks() {
  return <SharedSocialLinks className={s.socialLinks} pendingClassName={s.socialPending} />
}
