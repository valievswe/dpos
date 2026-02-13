export default function classNames(...args: Array<string | undefined | false | null>): string {
  return args.filter(Boolean).join(' ')
}
