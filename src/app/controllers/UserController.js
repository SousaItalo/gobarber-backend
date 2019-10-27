import * as Yup from 'yup';
import User from '../models/User';

class UserController {
  async store(req, res) {
    const schema = Yup.object().shape({
      name: Yup.string()
        .required(),
      email: Yup.string()
        .email()
        .required(),
      password: Yup.string()
        .required()
        .min(6)
    });

    try {
      await schema.validate(req.body)
    } catch (error) {
      return res.status(422).json({ errors: error.errors })
    }

    const userExists = await User.findOne({ where: { email: req.body.email } });

    if(userExists) {
      return res.status(422).json({ error: "Email already being used"});
    }

    const user = await User.create(req.body);

    return res.json(user);
  }

  async update(req, res) {
    const { email, oldPassword } = req.body;
    const user = await User.findByPk(req.userId);

    if(email) {
      const userExists = await User.findOne({ where: { email } });

      if(userExists) {
        return res.status(422).json({ error: "email already being used"});
      }
    }

    if(oldPassword && !(await user.checkPassword(oldPassword))) {
      return res.status(422).json({ error: "wrong current password" });
    }

    const updatedUser = await user.update(req.body);

    return res.json({ user: updatedUser });
  }
}

export default new UserController();
