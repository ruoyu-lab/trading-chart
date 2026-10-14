import { fail } from './errors';
import { checkString } from './validate';

/** Named definitions of one kind (series types, indicators, drawing tools), owned by one chart. */
export class Registry<Definition> {
  private readonly definitions = new Map<string, Definition>();
  private readonly builtIn: ReadonlySet<string>;

  constructor(
    private readonly kind: string,
    builtIns: Readonly<Record<string, Definition>>
  ) {
    Object.entries(builtIns).forEach(([name, definition]) => {
      this.definitions.set(name, definition);
    });
    this.builtIn = new Set(Object.keys(builtIns));
  }

  register(name: string, definition: Definition): void {
    checkString(`${this.kind} name`, name);

    if (this.builtIn.has(name)) {
      fail(`"${name}" is a built-in ${this.kind} and cannot be replaced.`);
    }

    if (this.definitions.has(name)) {
      fail(`A ${this.kind} named "${name}" is already registered.`);
    }

    this.definitions.set(name, definition);
  }

  get(name: string): Definition | undefined {
    return this.definitions.get(name);
  }

  require(name: string): Definition {
    return this.definitions.get(name) ?? fail(`Unknown ${this.kind} "${name}".`);
  }

  names(): string[] {
    return [...this.definitions.keys()];
  }
}
