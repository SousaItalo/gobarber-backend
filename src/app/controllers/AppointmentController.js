import * as Yup from 'yup';
import { startOfHour, parseISO, isBefore, format, differenceInHours } from 'date-fns';
import ptBR from 'date-fns/locale/pt-BR';
import Appointment from '../models/Appointment';
import User from '../models/User';
import File from '../models/File';
import Notification from '../schemas/Notification';

import CancellationMail from '../jobs/CancellationMail';
import Queue from '../../lib/Queue';
class AppointmentController {
  async index(req, res) {
    const { page = 1 } = req.query;

    const appointments = await Appointment.findAll({
      where: {
        user_id: req.userId,
        canceled_at: null
      },
      attributes: ['id', 'date'],
      limit : 20,
      offset: (page - 1) * 20,
      order: ['date'],
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'name'],
          include: [
            {
              model: File,
              as: 'avatar',
              attributes: ['path', 'url']
            },
          ]
        }
      ]
    });

    return res.json(appointments);
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      provider_id: Yup.number().required(),
      date: Yup.date().required(),
    });

    if(!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Validation fails' });
    }

    const { provider_id, date } = req.body;

    /**
     * Check if provider id is a provider
     */
    const isProvider = await User.findOne({
      where: { id: provider_id, provider: true },
    });

    if(!isProvider) {
      return res
        .status(422)
        .json({ error: 'You only can create appointments with providers' });
    }

    const hourStart = startOfHour(parseISO(date));

    if(isBefore(hourStart, new Date())) {
      return res.status(422).json({ error: 'You cannot create appointments in the past'});
    }

    const checkAvailability = await Appointment.findOne({
      where: {
        provider_id,
        canceled_at: null,
        date: hourStart,
      }
    });

    if(checkAvailability) {
      return res.status(422).json({ error: 'Appointment date is not available' });
    }

    const appointment = await Appointment.create({
      user_id: req.userId,
      provider_id,
      date,
    });

    const user = await User.findByPk(provider_id);

    const formatedDate = format(
      hourStart,
      "'dia' dd 'de' MMMM', às' H:mm'h'",
      { locale: ptBR }
    );

    await Notification.create({
      content: `Novo  agendamento de ${user.name} para dia ${formatedDate}`,
      user: provider_id,
    })

    return res.json(appointment);
  }

  async delete(req, res) {
    const appointment = await Appointment.findByPk(req.params.id,{
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['name', 'email' ]
        },
        {
          model: User,
          as: 'user',
          attributes: ['name']
        }
      ]
    });

    if(!appointment) {
      return res
        .status(404)
        .json({ error: 'Appointment not found' });
    }

    if(appointment.user_id !== req.userId) {
      return res
        .status(401)
        .json({ error: 'You can not delete this assignment' });
    }

    const diffInHours = differenceInHours(appointment.date, new Date());

    if(diffInHours < 2) {
      return res
        .status(422)
        .json({ error: 'You can not cancel an appointment within less than two hours' });
    }

    appointment.canceled_at = new Date();
    await appointment.save();
    await Queue.add(CancellationMail.key, {
      appointment,
    });

    return res.json(appointment);
  }
}

export default new AppointmentController();
